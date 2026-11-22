// Publicador del patrón Outbox (Entrega 2, §1.5).
// Cada cierto tiempo toma los eventos pendientes de outbox_event, los envía a RabbitMQ
// y, solo cuando el broker confirma, los marca como publicados.
//
// Garantía: "al menos una vez". Si el servicio se cae después de publicar y antes del
// COMMIT, el evento se reenvía; por eso los consumidores son idempotentes (eventId).

// Columnas permitidas para ordenar (lista cerrada: el valor se inserta en el SQL).
//   created_at -> suficiente cuando el orden entre eventos no importa
//   seq        -> orden real de los cambios (ms-inventory-stock, migración 003)
const ORDER_COLUMNS = ['created_at', 'seq'];

class OutboxPublisher {
  constructor({ pool, rabbit, producer, batchSize = 50, intervalMs = 1000, orderBy = 'created_at' }) {
    if (!ORDER_COLUMNS.includes(orderBy)) throw new Error(`orderBy debe ser uno de ${ORDER_COLUMNS.join(', ')}`);
    this.orderBy = orderBy;
    this.pool = pool;
    this.rabbit = rabbit;
    this.producer = producer;
    this.batchSize = batchSize;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.stopped = false;
  }

  start() {
    this.#loop();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  async publishPending() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // SKIP LOCKED: si hay 2 réplicas del servicio, cada una toma eventos distintos.
      const { rows } = await client.query(
        `SELECT id, event_type, payload, created_at
           FROM outbox_event
          WHERE published = FALSE
          ORDER BY ${this.orderBy}
          LIMIT $1
          FOR UPDATE SKIP LOCKED`,
        [this.batchSize],
      );
      if (rows.length === 0) {
        await client.query('COMMIT');
        return 0;
      }

      // Sobre común acordado entre los equipos: { eventId, eventType, occurredAt, producer, payload }
      await this.rabbit.publishBatch(rows.map((row) => ({
        routingKey: row.event_type,
        messageId: row.id,
        body: {
          eventId: row.id,
          eventType: row.event_type,
          occurredAt: row.created_at,
          producer: this.producer,
          payload: row.payload,
        },
      })));

      await client.query('UPDATE outbox_event SET published = TRUE WHERE id = ANY($1::uuid[])', [rows.map((r) => r.id)]);
      await client.query('COMMIT');
      return rows.length;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async #loop() {
    if (this.stopped) return;
    let published = 0;
    try {
      // Sin broker no se intenta: los eventos esperan seguros en la base de datos.
      if (this.rabbit.isConnected()) published = await this.publishPending();
      if (published > 0) console.log(`[outbox] ${published} evento(s) publicados`);
    } catch (err) {
      console.warn(`[outbox] No se pudo publicar, se reintentará: ${err.message}`);
    }
    // Si el lote salió lleno, quedan más pendientes: se sigue de inmediato.
    const delay = published === this.batchSize ? 0 : this.intervalMs;
    this.timer = setTimeout(() => this.#loop(), delay);
  }
}

module.exports = { OutboxPublisher };
