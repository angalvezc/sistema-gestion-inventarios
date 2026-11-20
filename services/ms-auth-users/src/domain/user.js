// Reglas de negocio del usuario y de los roles (RF01).
const { ValidationError } = require('./errors');

// Los tres roles definidos en la Entrega 1 (RF01) y en el modelo db_auth.
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  WAREHOUSE_OPERATOR: 'WAREHOUSE_OPERATOR',
  AUDITOR: 'AUDITOR',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

function assertValidId(id) {
  if (!UUID_RE.test(String(id))) {
    throw new ValidationError('El id debe ser un UUID válido');
  }
}

// Valida los datos para crear un usuario y reúne todos los errores a la vez.
function assertValidNewUser({ email, password, fullName, role }) {
  const details = [];
  if (!EMAIL_RE.test(normalizeEmail(email))) details.push('email: formato inválido');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    details.push(`password: mínimo ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (typeof fullName !== 'string' || fullName.trim().length === 0) {
    details.push('fullName: es obligatorio');
  }
  if (!isValidRole(role)) details.push(`role: debe ser uno de ${Object.values(ROLES).join(', ')}`);
  if (details.length > 0) throw new ValidationError('Datos de usuario inválidos', details);
}

// Valida una actualización parcial. El email no se puede cambiar (identifica al usuario).
function assertValidUpdate(changes) {
  const details = [];
  const allowed = ['fullName', 'role', 'active', 'password'];
  const keys = Object.keys(changes || {});
  if (keys.length === 0) details.push('Debe enviar al menos un campo a modificar');
  keys.filter((k) => !allowed.includes(k)).forEach((k) => details.push(`${k}: no se puede modificar`));
  if ('fullName' in changes && (typeof changes.fullName !== 'string' || !changes.fullName.trim())) {
    details.push('fullName: no puede estar vacío');
  }
  if ('role' in changes && !isValidRole(changes.role)) {
    details.push(`role: debe ser uno de ${Object.values(ROLES).join(', ')}`);
  }
  if ('active' in changes && typeof changes.active !== 'boolean') details.push('active: debe ser booleano');
  if ('password' in changes && (typeof changes.password !== 'string' || changes.password.length < MIN_PASSWORD_LENGTH)) {
    details.push(`password: mínimo ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (details.length > 0) throw new ValidationError('Datos de actualización inválidos', details);
}

// Representación pública: nunca expone el hash de la contraseña.
function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roleId: user.roleId,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

module.exports = {
  ROLES,
  normalizeEmail,
  isValidRole,
  assertValidId,
  assertValidNewUser,
  assertValidUpdate,
  toPublicUser,
};
