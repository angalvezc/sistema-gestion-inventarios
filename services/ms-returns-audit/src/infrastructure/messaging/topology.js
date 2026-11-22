// Cola de DESTINO del evento que publica ms-returns-audit (mismo criterio que en
// stock y compras): si ms-inventory-stock está caído, las devoluciones esperan aquí.
// Debe coincidir con la que declara el consumidor de stock: mismo nombre y { durable: true }.
const { EVENTS } = require('../../domain/events');

const OUTBOUND_QUEUES = [
  { queue: 'stock.return-processed', routingKey: EVENTS.RETURN_PROCESSED },
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
