// Reglas de negocio de existencias (RF03-RF06).
const { ValidationError } = require('./errors');

// Movimientos que un usuario puede registrar a mano (POST /stock/movements).
// TRANSFER_IN/OUT los genera una transferencia y RETURN_IN una devolución.
const MANUAL_MOVEMENT_TYPES = ['ENTRY', 'EXIT'];
const DECREASING_TYPES = ['EXIT', 'TRANSFER_OUT'];

// RF11: RESTOCK vuelve al inventario; DAMAGED es baja por avería (no suma stock).
const RETURN_DISPOSITIONS = ['RESTOCK', 'DAMAGED'];

const MAX_QUANTITY = 1_000_000; // tope por operación, evita desbordar el INT de PostgreSQL
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => UUID_RE.test(String(value));
const isId = (value) => Number.isInteger(value) && value > 0;
const isQuantity = (value) => Number.isInteger(value) && value > 0 && value <= MAX_QUANTITY;
const QUANTITY_RULE = `quantity: entero entre 1 y ${MAX_QUANTITY}`;

function assertUuid(value, field = 'productId') {
  if (!isUuid(value)) throw new ValidationError(`${field} debe ser un UUID válido`);
}

function throwIfAny(details, message) {
  if (details.length > 0) throw new ValidationError(message, details);
}

function assertValidMovement(m = {}) {
  const details = [];
  if (!isUuid(m.productId)) details.push('productId: debe ser un UUID válido');
  if (!isId(m.warehouseId)) details.push('warehouseId: debe ser un entero positivo');
  if (!MANUAL_MOVEMENT_TYPES.includes(m.type)) details.push(`type: debe ser uno de ${MANUAL_MOVEMENT_TYPES.join(', ')}`);
  if (!isQuantity(m.quantity)) details.push(QUANTITY_RULE);
  if (typeof m.reference !== 'string' || !m.reference.trim() || m.reference.length > 100) {
    details.push('reference: obligatoria, máximo 100 caracteres (ej. número de factura u OC)');
  }
  throwIfAny(details, 'Datos del movimiento inválidos');
}

function assertValidTransfer(t = {}) {
  const details = [];
  if (!isUuid(t.productId)) details.push('productId: debe ser un UUID válido');
  if (!isId(t.fromWarehouseId)) details.push('fromWarehouseId: debe ser un entero positivo');
  if (!isId(t.toWarehouseId)) details.push('toWarehouseId: debe ser un entero positivo');
  if (isId(t.fromWarehouseId) && t.fromWarehouseId === t.toWarehouseId) {
    details.push('toWarehouseId: debe ser distinta de la bodega de origen');
  }
  if (!isQuantity(t.quantity)) details.push(QUANTITY_RULE);
  if (t.reference !== undefined && (typeof t.reference !== 'string' || t.reference.length > 100)) {
    details.push('reference: máximo 100 caracteres');
  }
  throwIfAny(details, 'Datos de la transferencia inválidos');
}

function assertValidThreshold(b = {}) {
  const details = [];
  if (!isId(b.warehouseId)) details.push('warehouseId: debe ser un entero positivo');
  if (!Number.isInteger(b.minThreshold) || b.minThreshold < 0 || b.minThreshold > MAX_QUANTITY) {
    details.push(`minThreshold: entero entre 0 y ${MAX_QUANTITY}`);
  }
  throwIfAny(details, 'Datos del umbral inválidos');
}

// ---------- Eventos que llegan de otros servicios (RabbitMQ) ----------

function assertValidItems(items, details, { withWarehouse = false, withDisposition = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    details.push('items: debe ser una lista con al menos un ítem');
    return;
  }
  items.forEach((item, i) => {
    if (!item || !isUuid(item.productId)) details.push(`items[${i}].productId: debe ser un UUID válido`);
    if (!item || !isQuantity(item.quantity)) details.push(`items[${i}].${QUANTITY_RULE}`);
    if (withWarehouse && (!item || !isId(item.warehouseId))) details.push(`items[${i}].warehouseId: debe ser un entero positivo`);
    if (withDisposition && (!item || !RETURN_DISPOSITIONS.includes(item.disposition))) {
      details.push(`items[${i}].disposition: debe ser uno de ${RETURN_DISPOSITIONS.join(', ')}`);
    }
  });
}

// purchase.received (RF10): { orderId, orderNumber, warehouseId, items: [{ productId, sku, quantity }] }
function assertValidPurchaseReceived(p = {}) {
  const details = [];
  if (!p.orderNumber && !p.orderId) details.push('orderNumber u orderId: obligatorio');
  if (!isId(p.warehouseId)) details.push('warehouseId: debe ser un entero positivo');
  assertValidItems(p.items, details);
  throwIfAny(details, 'Evento purchase.received inválido');
}

// return.processed (RF11): { returnId, returnNumber, items: [{ productId, warehouseId, quantity, disposition }] }
function assertValidReturnProcessed(p = {}) {
  const details = [];
  if (!p.returnNumber && !p.returnId) details.push('returnNumber o returnId: obligatorio');
  assertValidItems(p.items, details, { withWarehouse: true, withDisposition: true });
  throwIfAny(details, 'Evento return.processed inválido');
}

// RF06: estado de alerta de un saldo.
//   OUT_OF_STOCK -> agotado (0 unidades)
//   LOW          -> por debajo del umbral mínimo configurado
//   null         -> sin alerta
function alertStatus(quantity, minThreshold) {
  if (quantity === 0) return 'OUT_OF_STOCK';
  if (quantity < minThreshold) return 'LOW';
  return null;
}

module.exports = {
  DECREASING_TYPES,
  isUuid,
  assertUuid,
  assertValidMovement,
  assertValidTransfer,
  assertValidThreshold,
  assertValidPurchaseReceived,
  assertValidReturnProcessed,
  alertStatus,
};
