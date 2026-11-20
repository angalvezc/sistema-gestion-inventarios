// Configuración del API Gateway leída de variables de entorno.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  return value;
}

function loadConfig() {
  return {
    port: Number(process.env.PORT || 8080),
    jwtSecret: required('JWT_SECRET'),

    // Service Discovery: nombres DNS de Docker Compose / Kubernetes (Entrega 2, §1.1).
    services: {
      auth: process.env.AUTH_URL || 'http://ms-auth-users:8081',
      products: process.env.PRODUCTS_URL || 'http://ms-products:8082',
      stock: process.env.STOCK_URL || 'http://ms-inventory-stock:8083',
      suppliers: process.env.SUPPLIERS_URL || 'http://ms-suppliers:8084',
      purchases: process.env.PURCHASES_URL || 'http://ms-purchases:8085',
      audit: process.env.AUDIT_URL || 'http://ms-returns-audit:8086',
    },

    upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 10000),

    rateLimit: {
      max: Number(process.env.RATE_LIMIT_MAX || 600), // peticiones por IP...
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000), // ...en esta ventana
    },

    // En Kubernetes hay un Ingress delante: TRUST_PROXY=1 para leer la IP real del cliente.
    trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false,
  };
}

module.exports = { loadConfig };
