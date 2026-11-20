// Eventos de dominio que publica ms-inventory-stock (contrato acordado con ms-returns-audit).
const EVENTS = Object.freeze({
  MOVEMENT_CREATED: 'stock.movement.created', // lo consume ms-returns-audit para el Kardex (RF07)
  STOCK_LOW: 'stock.low', // saldo bajo el mínimo o agotado (RF06)
});

function movementCreatedPayload(movement, user) {
  return {
    movementId: movement.id,
    productId: movement.productId,
    sku: null, // stock no conoce el SKU (vive en db_products); el Kardex puede completarlo
    warehouseId: movement.warehouseId,
    type: movement.type,
    quantity: movement.quantity,
    balanceAfter: movement.balanceAfter,
    reference: movement.reference,
    transferId: movement.transferId,
    userId: user.id,
    userEmail: user.email,
    occurredAt: movement.createdAt,
  };
}

function stockLowPayload({ productId, warehouseId, quantity, minThreshold, status }) {
  return { productId, warehouseId, quantity, minThreshold, status };
}

module.exports = { EVENTS, movementCreatedPayload, stockLowPayload };
