// Eventos de dominio que publica ms-purchases (contrato acordado con ms-inventory-stock).
const EVENTS = Object.freeze({
  PURCHASE_RECEIVED: 'purchase.received', // lo consume ms-inventory-stock para sumar stock (RF10)
});

// Formato que espera el consumidor de stock:
//   { orderId, orderNumber, warehouseId, items: [{ productId, sku, quantity }], userId, userEmail }
function purchaseReceivedPayload(order, items, user) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    warehouseId: order.destinationWarehouseId,
    items: items.map((it) => ({ productId: it.productId, sku: it.sku, quantity: it.quantity })),
    userId: user.id,
    userEmail: user.email,
  };
}

module.exports = { EVENTS, purchaseReceivedPayload };
