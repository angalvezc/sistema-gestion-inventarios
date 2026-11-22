// Consumidor de stock.movement.created (cola audit.stock-movement) -> Kardex (RF07).
// Mismo comportamiento que el consumidor de ms-inventory-stock:
//   - ack solo después del COMMIT (si el servicio cae antes, RabbitMQ reentrega)
//   - mensaje inválido: se registra y se descarta
//   - error temporal (ej. BD caída): vuelve a la cola tras una pausa
const { DomainError, ValidationError } = require('../../domain/errors');
const { EVENTS } = require('../../domain/events');
const { isUuid } = require('../../domain/kardex');

// Debe coincidir con la cola que declara ms-inventory-stock (mismo nombre, durable).
const QUEUE = 'audit.stock-movement';

function parseEnvelope(msg) {
  let envelope;
  try {
    envelope = JSON.parse(msg.content.toString());
  } catch {
    throw new ValidationError('El mensaje no es un JSON válido');
  }
  if (!isUuid(envelope.eventId)) throw new ValidationError('eventId debe ser un UUID válido');
  if (!envelope.payload || typeof envelope.payload !== 'object') throw new ValidationError('payload es obligatorio');
  return { ...envelope, eventType: envelope.eventType || msg.fields.routingKey };
}

class KardexConsumer {
  constructor({ kardexService, exchange, prefetch = 10, retryDelayMs = 5000 }) {
    this.kardex = kardexService;
    this.exchange = exchange;
    this.prefetch = prefetch;
    this.retryDelayMs = retryDelayMs;
  }

  async setup(connection) {
    const channel = await connection.createChannel();
    await channel.prefetch(this.prefetch);
    await channel.assertExchange(this.exchange, 'topic', { durable: true });
    await channel.assertQueue(QUEUE, { durable: true });
    await channel.bindQueue(QUEUE, this.exchange, EVENTS.MOVEMENT_CREATED);
    await channel.consume(QUEUE, (msg) => this.handle(channel, msg), { noAck: false });
    console.log(`[consumer] Escuchando ${EVENTS.MOVEMENT_CREATED} en la cola ${QUEUE}`);
  }

  async handle(channel, msg) {
    if (!msg) return;
    let event;
    try {
      event = parseEnvelope(msg);
      if (event.eventType !== EVENTS.MOVEMENT_CREATED) {
        throw new ValidationError(`Tipo de evento no soportado: ${event.eventType}`);
      }
      const result = await this.kardex.recordMovement(event);
      console.log(result.duplicate
        ? `[kardex] ${event.eventId} ya registrado: se ignora (idempotencia)`
        : `[kardex] ${event.eventId} registrado (${event.payload.type} x${event.payload.quantity})`);
      channel.ack(msg);
    } catch (err) {
      if (err instanceof DomainError) {
        console.error(`[consumer] Evento descartado (${err.message})`, err.details || '', event ? event.eventId : '');
        channel.ack(msg);
        return;
      }
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

module.exports = { KardexConsumer, QUEUE };
