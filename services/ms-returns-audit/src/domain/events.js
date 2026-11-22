// Eventos de dominio de ms-returns-audit (contrato acordado con ms-inventory-stock).
const EVENTS = Object.freeze({
  MOVEMENT_CREATED: 'stock.movement.created', // consume: alimenta el Kardex (RF07)
  RETURN_PROCESSED: 'return.processed', // publica: stock reingresa los ítems RESTOCK (RF11)
});

// Formato que espera el consumidor de stock:
//   { returnId, returnNumber, items: [{ productId, warehouseId, quantity, disposition }], userId, userEmail }
function returnProcessedPayload(ret, user) {
  return {
    returnId: ret.id,
    returnNumber: ret.returnNumber,
    items: ret.items.map((it) => ({
      productId: it.productId, warehouseId: it.warehouseId, quantity: it.quantity, disposition: it.disposition,
    })),
    userId: user.id,
    userEmail: user.email,
  };
}

module.exports = { EVENTS, returnProcessedPayload };
