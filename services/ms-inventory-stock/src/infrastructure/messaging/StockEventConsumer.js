// Consumidores de eventos de otros servicios (RNF08):
//   purchase.received  -> cola stock.purchase-received (RF10)
//   return.processed   -> cola stock.return-processed  (RF11)
//
// El mensaje se confirma (ack) solo después de que la transacción hizo COMMIT.
// Si el servicio se cae antes, RabbitMQ lo reentrega.
const { DomainError, ValidationError } = require('../../domain/errors');
const { EVENTS } = require('../../domain/events');
const { isUuid } = require('../../domain/stock');

const BINDINGS = [
  { queue: 'stock.purchase-received', routingKey: EVENTS.PURCHASE_RECEIVED },
  { queue: 'stock.return-processed', routingKey: EVENTS.RETURN_PROCESSED },
];

// Valida el sobre común: { eventId, eventType, occurredAt, producer, payload }
function parseEnvelope(msg) {
  let envelope;
  try {
    envelope = JSON.parse(msg.content.toString());
  } catch {
    throw new ValidationError('El mensaje no es un JSON válido');
  }
  const eventType = envelope.eventType || msg.fields.routingKey;
  if (!isUuid(envelope.eventId)) throw new ValidationError('eventId debe ser un UUID válido');
  if (!envelope.payload || typeof envelope.payload !== 'object') throw new ValidationError('payload es obligatorio');
  return { ...envelope, eventType };
}

class StockEventConsumer {
  constructor({ stockService, exchange, prefetch = 10, retryDelayMs = 5000 }) {
    this.exchange = exchange;
    this.prefetch = prefetch;
    this.retryDelayMs = retryDelayMs;
    this.handlers = {
      [EVENTS.PURCHASE_RECEIVED]: (event) => stockService.applyPurchaseReceived(event),
      [EVENTS.RETURN_PROCESSED]: (event) => stockService.applyReturnProcessed(event),
    };
  }

  // Se llama en cada (re)conexión a RabbitMQ.
  async setup(connection) {
    const channel = await connection.createChannel();
    await channel.prefetch(this.prefetch); // máximo de mensajes sin confirmar a la vez
    await channel.assertExchange(this.exchange, 'topic', { durable: true });
    for (const { queue, routingKey } of BINDINGS) {
      await channel.assertQueue(queue, { durable: true }); // la cola sobrevive a reinicios
      await channel.bindQueue(queue, this.exchange, routingKey);
      await channel.consume(queue, (msg) => this.handle(channel, msg), { noAck: false });
      console.log(`[consumer] Escuchando ${routingKey} en la cola ${queue}`);
    }
  }

  async handle(channel, msg) {
    if (!msg) return; // RabbitMQ canceló el consumidor
    let event;
    try {
      event = parseEnvelope(msg);
      const handler = this.handlers[event.eventType];
      if (!handler) throw new ValidationError(`Tipo de evento no soportado: ${event.eventType}`);

      const result = await handler(event);
      console.log(result.duplicate
        ? `[consumer] ${event.eventType} ${event.eventId} ya procesado: se ignora (idempotencia)`
        : `[consumer] ${event.eventType} ${event.eventId} aplicado: ${result.movements} movimiento(s)`);
      channel.ack(msg);
    } catch (err) {
      if (err instanceof DomainError) {
        // Mensaje inválido: reintentarlo nunca funcionará. Se registra y se descarta
        // para no bloquear la cola.
        console.error(`[consumer] Evento descartado (${err.message})`, err.details || '', event ? event.eventId : '');
        channel.ack(msg);
        return;
      }
      // Error temporal (p. ej. base de datos caída): se devuelve a la cola tras una pausa.
      console.warn(`[consumer] Error temporal, se reintentará: ${err.message}`);
      setTimeout(() => {
        try {
          channel.nack(msg, false, true);
        } catch {
          // Si el canal ya se cerró, RabbitMQ reentrega el mensaje por sí solo.
        }
      }, this.retryDelayMs);
    }
  }
}

module.exports = { StockEventConsumer, BINDINGS };
