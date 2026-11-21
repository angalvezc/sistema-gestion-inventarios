// Cola de DESTINO del evento que publica ms-purchases (mismo criterio que en stock).
// Un mensaje que llega a un exchange sin cola enlazada se descarta; declarando la cola
// acordada con ms-inventory-stock, las recepciones esperan ahí aunque stock esté caído.
// Debe coincidir con la que declara el consumidor: mismo nombre y { durable: true }.
const { EVENTS } = require('../../domain/events');

const OUTBOUND_QUEUES = [
  { queue: 'stock.purchase-received', routingKey: EVENTS.PURCHASE_RECEIVED },
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
