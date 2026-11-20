// Colas de DESTINO de los eventos que publica ms-inventory-stock.
//
// En RabbitMQ, un mensaje que llega a un exchange sin ninguna cola enlazada se descarta.
// Para no perder eventos del Kardex mientras ms-returns-audit no está arriba (o aún no
// existe), stock declara la cola acordada en el contrato con el otro equipo; los eventos
// esperan ahí hasta que el consumidor los lea.
//
// IMPORTANTE para ms-returns-audit: debe declarar la cola con el MISMO nombre y
// { durable: true }; si usa otras opciones, RabbitMQ rechaza la declaración.
const { EVENTS } = require('../../domain/events');

const OUTBOUND_QUEUES = [
  { queue: 'audit.stock-movement', routingKey: EVENTS.MOVEMENT_CREATED },
];

async function declareOutboundQueues(connection, exchange) {
  const channel = await connection.createChannel();
  try {
    await channel.assertExchange(exchange, 'topic', { durable: true });
    for (const { queue, routingKey } of OUTBOUND_QUEUES) {
      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, routingKey);
    }
  } finally {
    await channel.close();
  }
}

module.exports = { declareOutboundQueues, OUTBOUND_QUEUES };
