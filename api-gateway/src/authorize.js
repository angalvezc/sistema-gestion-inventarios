// Autenticación (JWT, RNF07) y autorización por rol (RBAC) de cada petición.
const jwt = require('jsonwebtoken');
const { sendError } = require('./errors');

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Devuelve true si la petición puede continuar; si no, ya respondió 401/403.
function authorize(req, res, rule, jwtSecret) {
  if (rule.roles === null) return true; // ruta pública

  const token = bearerToken(req);
  if (!token) {
    sendError(req, res, 401, 'UNAUTHORIZED', 'Falta el token (Authorization: Bearer <JWT>)');
    return false;
  }

  try {
    // Misma firma y algoritmo que usa ms-auth-users al emitir el token.
    const claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: claims.sub, email: claims.email, role: claims.role };
  } catch {
    sendError(req, res, 401, 'UNAUTHORIZED', 'Token inválido o expirado');
    return false;
  }

  if (!rule.roles.includes(req.user.role)) {
    sendError(req, res, 403, 'FORBIDDEN', `El rol ${req.user.role} no tiene permiso para esta operación`);
    return false;
  }
  return true;
}

module.exports = { authorize };
