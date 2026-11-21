// Reglas de negocio de proveedores (RF08).
const { ValidationError } = require('./errors');

const NIT_RE = /^(\d{6,15})-(\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\- ]{7,30}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CONTACTS = 10;

// Pesos oficiales de la DIAN para el dígito de verificación del NIT, aplicados
// desde el último dígito del número hacia la izquierda.
const DIAN_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

// Dígito de verificación (DV) según la DIAN:
//   1. Se multiplica cada dígito (de derecha a izquierda) por su peso y se suman.
//   2. Se toma el residuo de dividir la suma entre 11.
//   3. Si el residuo es 0 o 1, ese es el DV; si no, el DV es 11 - residuo.
function nitCheckDigit(number) {
  const digits = String(number).split('').reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * DIAN_WEIGHTS[i], 0);
  const remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}

function validateNit(nit, details) {
  const match = NIT_RE.exec(String(nit || '').trim());
  if (!match) {
    details.push('nit: formato 900123456-7 (número, guion y dígito de verificación)');
    return null;
  }
  const expected = nitCheckDigit(match[1]);
  if (Number(match[2]) !== expected) {
    details.push(`nit: el dígito de verificación no corresponde (para ${match[1]} debe ser ${expected})`);
  }
  return `${match[1]}-${match[2]}`;
}

const isText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
const optional = (v) => v === undefined || v === null || v === '';
const clean = (v) => (optional(v) ? null : String(v).trim());

function assertUuid(value, field = 'id') {
  if (!UUID_RE.test(String(value))) throw new ValidationError(`${field} debe ser un UUID válido`);
}

function validateContacts(contacts, details) {
  if (contacts === undefined) return [];
  if (!Array.isArray(contacts) || contacts.length > MAX_CONTACTS) {
    details.push(`contacts: lista de máximo ${MAX_CONTACTS} contactos`);
    return [];
  }
  return contacts.map((c, i) => {
    const item = c || {};
    if (!isText(item.name, 2, 100)) details.push(`contacts[${i}].name: obligatorio, entre 2 y 100 caracteres`);
    if (!optional(item.role) && !isText(item.role, 1, 60)) details.push(`contacts[${i}].role: máximo 60 caracteres`);
    if (!optional(item.email) && !EMAIL_RE.test(String(item.email).trim())) details.push(`contacts[${i}].email: formato inválido`);
    if (!optional(item.phone) && !PHONE_RE.test(String(item.phone).trim())) details.push(`contacts[${i}].phone: formato inválido`);
    return {
      name: typeof item.name === 'string' ? item.name.trim() : '',
      role: clean(item.role),
      email: optional(item.email) ? null : String(item.email).trim().toLowerCase(),
      phone: clean(item.phone),
    };
  });
}

// Valida un proveedor y devuelve la versión normalizada; reúne todos los errores.
function validateSupplier(input = {}) {
  const details = [];
  const nit = validateNit(input.nit, details);
  if (!isText(input.businessName, 2, 150)) details.push('businessName: obligatorio, entre 2 y 150 caracteres');
  if (!EMAIL_RE.test(String(input.email || '').trim())) details.push('email: formato inválido');
  if (!optional(input.phone) && !PHONE_RE.test(String(input.phone).trim())) details.push('phone: entre 7 y 30 caracteres (números, espacios, +, -, paréntesis)');
  if (!optional(input.address) && !isText(input.address, 1, 200)) details.push('address: máximo 200 caracteres');
  if (!isText(input.paymentTerms, 2, 60)) details.push('paymentTerms: obligatorio, entre 2 y 60 caracteres (ej. "Crédito 30 días")');
  if (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0 || input.leadTimeDays > 365) {
    details.push('leadTimeDays: entero entre 0 y 365');
  }
  if (input.active !== undefined && typeof input.active !== 'boolean') details.push('active: debe ser booleano');
  const contacts = validateContacts(input.contacts, details);

  if (details.length > 0) throw new ValidationError('Datos del proveedor inválidos', details);

  return {
    nit,
    businessName: input.businessName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: clean(input.phone),
    address: clean(input.address),
    paymentTerms: input.paymentTerms.trim(),
    leadTimeDays: input.leadTimeDays,
    active: input.active,
    contacts,
  };
}

module.exports = { nitCheckDigit, assertUuid, validateSupplier };
