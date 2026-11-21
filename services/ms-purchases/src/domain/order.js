// Reglas de negocio de las órdenes de compra (RF09, RF10).
const { ValidationError, InvalidStateError } = require('./errors');

const STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
});

// Máquina de estados: desde qué estados se puede llegar a cada uno.
//   DRAFT --approve--> APPROVED --receive--> RECEIVED
//     └------------cancel-----------┴--> CANCELLED
const ALLOWED_FROM = Object.freeze({
  [STATUS.APPROVED]: [STATUS.DRAFT],
  [STATUS.RECEIVED]: [STATUS.APPROVED],
  [STATUS.CANCELLED]: [STATUS.DRAFT, STATUS.APPROVED],
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 1_000_000;
const MAX_UNIT_COST = 9_999_999_999.99;

const isUuid = (v) => UUID_RE.test(String(v));

function assertUuid(value, field = 'id') {
  if (!isUuid(value)) throw new ValidationError(`${field} debe ser un UUID válido`);
}

function assertTransition(currentStatus, targetStatus) {
  if (!ALLOWED_FROM[targetStatus].includes(currentStatus)) {
    throw new InvalidStateError(currentStatus, targetStatus);
  }
}

// Valida la forma de la orden (sin consultar a otros servicios) y la normaliza.
function validateOrderInput(input = {}, allowedWarehouses = []) {
  const details = [];
  if (!isUuid(input.supplierId)) details.push('supplierId: debe ser un UUID válido');
  if (!allowedWarehouses.includes(input.destinationWarehouseId)) {
    details.push(`destinationWarehouseId: debe ser una de las bodegas ${allowedWarehouses.join(', ')}`);
  }

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0 || items.length > MAX_ITEMS) details.push(`items: entre 1 y ${MAX_ITEMS} ítems`);
  const seen = new Set();
  items.forEach((item, i) => {
    const it = item || {};
    if (!isUuid(it.productId)) details.push(`items[${i}].productId: debe ser un UUID válido`);
    else if (seen.has(it.productId.toLowerCase())) details.push(`items[${i}].productId: producto repetido en la orden`);
    else seen.add(it.productId.toLowerCase());
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QUANTITY) {
      details.push(`items[${i}].quantity: entero entre 1 y ${MAX_QUANTITY}`);
    }
    if (typeof it.unitCost !== 'number' || !Number.isFinite(it.unitCost) || it.unitCost < 0 || it.unitCost > MAX_UNIT_COST) {
      details.push(`items[${i}].unitCost: número mayor o igual a 0`);
    }
  });

  if (details.length > 0) throw new ValidationError('Datos de la orden inválidos', details);

  return {
    supplierId: input.supplierId,
    destinationWarehouseId: input.destinationWarehouseId,
    items: items.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      unitCost: Math.round(it.unitCost * 100) / 100,
    })),
  };
}

// Total = suma de cantidad x costo unitario, en centavos para evitar errores de redondeo.
function computeTotal(items) {
  const cents = items.reduce((sum, it) => sum + it.quantity * Math.round(it.unitCost * 100), 0);
  return cents / 100;
}

module.exports = { STATUS, assertUuid, assertTransition, validateOrderInput, computeTotal };
