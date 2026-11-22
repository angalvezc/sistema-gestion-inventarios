// Reglas del Kardex inalterable (RF07, RNF12).
const crypto = require('crypto');
const { ValidationError } = require('./errors');

const MOVEMENT_TYPES = ['ENTRY', 'EXIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN_IN'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hash "anterior" de la primera fila de la cadena.
const GENESIS_HASH = '0'.repeat(64);

const isUuid = (v) => UUID_RE.test(String(v));

// Valida el payload de stock.movement.created y lo convierte en una fila del Kardex.
function toKardexEntry(event) {
  const p = event.payload || {};
  const details = [];
  if (!isUuid(p.productId)) details.push('productId: debe ser un UUID válido');
  if (!Number.isInteger(p.warehouseId) || p.warehouseId <= 0) details.push('warehouseId: debe ser un entero positivo');
  if (!MOVEMENT_TYPES.includes(p.type)) details.push(`type: debe ser uno de ${MOVEMENT_TYPES.join(', ')}`);
  if (!Number.isInteger(p.quantity) || p.quantity <= 0) details.push('quantity: entero positivo');
  if (!Number.isInteger(p.balanceAfter) || p.balanceAfter < 0) details.push('balanceAfter: entero mayor o igual a 0');
  const occurredAt = new Date(p.occurredAt || event.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) details.push('occurredAt: fecha inválida');
  if (details.length > 0) throw new ValidationError('Evento stock.movement.created inválido', details);

  return {
    eventId: event.eventId,
    productId: p.productId,
    skuSnapshot: p.sku || null,
    warehouseId: p.warehouseId,
    movementType: p.type,
    quantity: p.quantity,
    balanceAfter: p.balanceAfter,
    reference: p.reference ? String(p.reference).slice(0, 100) : null,
    userId: isUuid(p.userId) ? p.userId : null,
    userEmail: p.userEmail ? String(p.userEmail).slice(0, 150) : null,
    occurredAt,
  };
}

// Hash encadenado: SHA-256 de (hash de la fila anterior + datos de esta fila).
// Si alguien altera una fila antigua directamente en la base, su hash ya no coincide
// y todas las filas siguientes quedan "desencadenadas": la manipulación se detecta.
function computeRowHash(previousHash, e) {
  const canonical = [
    previousHash,
    e.eventId,
    e.productId,
    e.skuSnapshot || '',
    e.warehouseId,
    e.movementType,
    e.quantity,
    e.balanceAfter,
    e.reference || '',
    e.userId || '',
    e.userEmail || '',
    new Date(e.occurredAt).toISOString(),
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = { MOVEMENT_TYPES, GENESIS_HASH, isUuid, toKardexEntry, computeRowHash };
