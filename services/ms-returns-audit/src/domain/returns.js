// Reglas de devoluciones y garantías (RF11).
const { ValidationError } = require('./errors');
const { isUuid } = require('./kardex');

const ORIGINS = ['CLIENT', 'SUPPLIER']; // devolución de un cliente o hacia/desde un proveedor
const DISPOSITIONS = ['RESTOCK', 'DAMAGED']; // RESTOCK vuelve al inventario; DAMAGED es baja por avería
const MAX_ITEMS = 50;
const MAX_QUANTITY = 1_000_000;

function validateReturn(input = {}, warehouseIds = []) {
  const details = [];
  if (!ORIGINS.includes(input.origin)) details.push(`origin: debe ser uno de ${ORIGINS.join(', ')}`);
  if (typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.trim().length > 300) {
    details.push('reason: obligatorio, entre 3 y 300 caracteres');
  }
  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0 || items.length > MAX_ITEMS) details.push(`items: entre 1 y ${MAX_ITEMS} ítems`);
  items.forEach((item, i) => {
    const it = item || {};
    if (!isUuid(it.productId)) details.push(`items[${i}].productId: debe ser un UUID válido`);
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QUANTITY) {
      details.push(`items[${i}].quantity: entero entre 1 y ${MAX_QUANTITY}`);
    }
    if (!DISPOSITIONS.includes(it.disposition)) details.push(`items[${i}].disposition: debe ser uno de ${DISPOSITIONS.join(', ')}`);
    if (!warehouseIds.includes(it.warehouseId)) details.push(`items[${i}].warehouseId: debe ser una de las bodegas ${warehouseIds.join(', ')}`);
  });
  if (details.length > 0) throw new ValidationError('Datos de la devolución inválidos', details);

  return {
    origin: input.origin,
    reason: input.reason.trim(),
    items: items.map((it) => ({
      productId: it.productId, quantity: it.quantity, disposition: it.disposition, warehouseId: it.warehouseId,
    })),
  };
}

module.exports = { ORIGINS, DISPOSITIONS, validateReturn };
