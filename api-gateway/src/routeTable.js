// Tabla de enrutamiento y control de acceso por rol (RBAC).
// Es la traducción directa de la tabla "Resumen de endpoints" de la Entrega 2, §2.1.
//   "Todos"       -> cualquier usuario autenticado (ALL)
//   "Público"     -> no requiere token (PUBLIC)
//   "Interno"     -> no se publica: /auth/validate no aparece aquí, responde 404 desde fuera.

const ADMIN = 'ADMIN';
const OPERATOR = 'WAREHOUSE_OPERATOR';
const AUDITOR = 'AUDITOR';
const ALL = [ADMIN, OPERATOR, AUDITOR];
const PUBLIC = null;

const PREFIX = '/api/v1';

// [método, ruta, servicio destino, roles permitidos]
const RULES = [
  // ms-auth-users
  ['POST', '/auth/login', 'auth', PUBLIC],
  // Público porque la credencial es el propio refresh token: cuando se llama,
  // el access token normalmente ya expiró.
  ['POST', '/auth/refresh', 'auth', PUBLIC],
  ['GET', '/users', 'auth', [ADMIN]],
  ['POST', '/users', 'auth', [ADMIN]],
  ['PUT', '/users/:id', 'auth', [ADMIN]],
  ['DELETE', '/users/:id', 'auth', [ADMIN]],

  // ms-products
  ['GET', '/products', 'products', ALL],
  ['POST', '/products', 'products', [ADMIN]],
  ['GET', '/products/:id', 'products', ALL],
  ['PUT', '/products/:id', 'products', [ADMIN]],
  ['DELETE', '/products/:id', 'products', [ADMIN]],
  ['GET', '/categories', 'products', ALL],
  ['POST', '/categories', 'products', [ADMIN]],

  // ms-inventory-stock (las rutas fijas van antes que /stock/:productId)
  ['GET', '/stock', 'stock', ALL],
  ['GET', '/stock/alerts', 'stock', ALL],
  ['POST', '/stock/movements', 'stock', [ADMIN, OPERATOR]],
  ['POST', '/stock/transfers', 'stock', [ADMIN, OPERATOR]],
  ['GET', '/stock/:productId', 'stock', ALL],
  ['PUT', '/stock/:productId/min-threshold', 'stock', [ADMIN]],
  ['GET', '/warehouses', 'stock', ALL],

  // ms-suppliers
  ['GET', '/suppliers', 'suppliers', ALL],
  ['POST', '/suppliers', 'suppliers', [ADMIN]],
  ['GET', '/suppliers/:id', 'suppliers', ALL],
  ['PUT', '/suppliers/:id', 'suppliers', [ADMIN]],
  ['DELETE', '/suppliers/:id', 'suppliers', [ADMIN]],

  // ms-purchases
  ['GET', '/purchases/orders', 'purchases', ALL],
  ['POST', '/purchases/orders', 'purchases', [ADMIN]],
  ['GET', '/purchases/orders/:id', 'purchases', ALL],
  ['POST', '/purchases/orders/:id/approve', 'purchases', [ADMIN]],
  ['POST', '/purchases/orders/:id/receive', 'purchases', [ADMIN, OPERATOR]],
  ['POST', '/purchases/orders/:id/cancel', 'purchases', [ADMIN]],

  // ms-returns-audit
  ['GET', '/audit/kardex', 'audit', [AUDITOR, ADMIN]],
  ['GET', '/audit/kardex/:id', 'audit', [AUDITOR, ADMIN]],
  ['POST', '/audit/returns', 'audit', [ADMIN, OPERATOR]],
  ['GET', '/audit/returns', 'audit', ALL],
  ['GET', '/audit/dashboard/metrics', 'audit', ALL],
];

// Convierte "/stock/:productId" en una expresión regular (acepta "/" final opcional).
function toRegex(path) {
  const pattern = (PREFIX + path).replace(/:[A-Za-z]+/g, '[^/]+');
  return new RegExp(`^${pattern}/?$`);
}

const COMPILED = RULES.map(([method, path, service, roles]) => ({
  method,
  path: PREFIX + path,
  regex: toRegex(path),
  service,
  roles,
}));

// Devuelve { rule } si hay coincidencia, o { status: 404 | 405 } si no.
function matchRoute(method, path) {
  const samePath = COMPILED.filter((r) => r.regex.test(path));
  if (samePath.length === 0) return { status: 404 };
  const rule = samePath.find((r) => r.method === method);
  return rule ? { rule } : { status: 405 };
}

module.exports = { matchRoute, RULES, ROLES: { ADMIN, OPERATOR, AUDITOR } };
