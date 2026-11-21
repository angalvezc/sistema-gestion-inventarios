// Reglas de negocio del catálogo (RF02).
const { ValidationError } = require('./errors');

const UNITS = ['UND', 'CAJA'];
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{1,39}$/; // 2-40 caracteres: letras, números y guiones
const BARCODE_RE = /^\d{8,14}$/; // EAN-8, EAN-13, GTIN-14
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PRICE = 9_999_999_999.99; // NUMERIC(12, 2)
const MAX_SPECS = 30;

const isId = (v) => Number.isInteger(v) && v > 0;
const isText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

// El SKU se guarda en mayúsculas y sin espacios: "sku-001 " y "SKU-001" son el mismo.
function normalizeSku(sku) {
  return String(sku || '').trim().toUpperCase();
}

function assertUuid(value, field = 'id') {
  if (!UUID_RE.test(String(value))) throw new ValidationError(`${field} debe ser un UUID válido`);
}

function validateSpecs(specs, details) {
  if (specs === undefined) return [];
  if (!Array.isArray(specs) || specs.length > MAX_SPECS) {
    details.push(`specs: lista de máximo ${MAX_SPECS} especificaciones`);
    return [];
  }
  const keys = new Set();
  return specs.map((s, i) => {
    if (!s || !isText(s.key, 1, 60)) details.push(`specs[${i}].key: obligatorio, máximo 60 caracteres`);
    if (!s || !isText(s.value, 1, 200)) details.push(`specs[${i}].value: obligatorio, máximo 200 caracteres`);
    const key = s && typeof s.key === 'string' ? s.key.trim() : '';
    if (key && keys.has(key.toLowerCase())) details.push(`specs[${i}].key: "${key}" está repetida`);
    keys.add(key.toLowerCase());
    return { key, value: s && typeof s.value === 'string' ? s.value.trim() : '' };
  });
}

// Valida los datos de un producto y devuelve la versión normalizada.
// Reúne todos los errores a la vez para que el cliente los corrija de una sola vez.
function validateProduct(input = {}) {
  const details = [];
  const sku = normalizeSku(input.sku);
  if (!SKU_RE.test(sku)) details.push('sku: 2 a 40 caracteres, solo letras, números y guiones');
  if (!BARCODE_RE.test(String(input.barcode || ''))) details.push('barcode: entre 8 y 14 dígitos (EAN-8, EAN-13 o GTIN-14)');
  if (!isText(input.name, 1, 150)) details.push('name: obligatorio, máximo 150 caracteres');
  if (input.description !== undefined && input.description !== null && !isText(input.description, 0, 500)) {
    details.push('description: máximo 500 caracteres');
  }
  if (!isId(input.categoryId)) details.push('categoryId: debe ser un entero positivo');
  if (typeof input.basePrice !== 'number' || !Number.isFinite(input.basePrice) || input.basePrice < 0 || input.basePrice > MAX_PRICE) {
    details.push('basePrice: número mayor o igual a 0');
  }
  if (!UNITS.includes(input.unit)) details.push(`unit: debe ser uno de ${UNITS.join(', ')}`);
  if (input.active !== undefined && typeof input.active !== 'boolean') details.push('active: debe ser booleano');
  const specs = validateSpecs(input.specs, details);

  if (details.length > 0) throw new ValidationError('Datos del producto inválidos', details);

  return {
    sku,
    barcode: String(input.barcode),
    name: input.name.trim(),
    description: input.description ? input.description.trim() : null,
    categoryId: input.categoryId,
    basePrice: Math.round(input.basePrice * 100) / 100, // 2 decimales, como NUMERIC(12, 2)
    unit: input.unit,
    active: input.active,
    specs,
  };
}

function validateCategory(input = {}) {
  const details = [];
  if (!isText(input.name, 2, 80)) details.push('name: obligatorio, entre 2 y 80 caracteres');
  if (input.description !== undefined && input.description !== null && !isText(input.description, 0, 200)) {
    details.push('description: máximo 200 caracteres');
  }
  if (details.length > 0) throw new ValidationError('Datos de la categoría inválidos', details);
  return { name: input.name.trim(), description: input.description ? input.description.trim() : null };
}

module.exports = { UNITS, normalizeSku, assertUuid, validateProduct, validateCategory };
