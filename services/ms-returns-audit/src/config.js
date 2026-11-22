// Configuración del servicio leída de variables de entorno (12-factor, Entrega 2 §4.1).
const path = require('path');

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  }
  return value;
}

function loadConfig() {
  const db = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: required('DB_NAME'),
  };
  return {
    port: Number(process.env.PORT || 8086),
    // RNF12: dos credenciales distintas.
    //   owner   -> dueño de la base: solo para migraciones y permisos
    //   runtime -> audit_runtime: con el que trabaja el servicio (sin UPDATE/DELETE en el Kardex)
    ownerDb: { ...db, user: required('DB_USER'), password: required('DB_PASSWORD') },
    runtimeDb: { ...db, user: 'audit_runtime', password: required('DB_RUNTIME_PASSWORD') },
    productsUrl: process.env.PRODUCTS_URL || 'http://ms-products:8082',
    serviceTimeoutMs: Number(process.env.SERVICE_TIMEOUT_MS || 3000),
    warehouseIds: (process.env.WAREHOUSE_IDS || '1,2').split(',').map((v) => Number(v.trim())).filter(Number.isInteger),
    timezone: process.env.APP_TIMEZONE || 'America/Bogota',
    rabbitmq: {
      url: process.env.RABBITMQ_URL,
      exchange: process.env.RABBITMQ_EXCHANGE || 'logitech.events',
    },
    outbox: {
      intervalMs: Number(process.env.OUTBOX_INTERVAL_MS || 1000),
      batchSize: Number(process.env.OUTBOX_BATCH_SIZE || 50),
    },
    openapiPath:
      process.env.OPENAPI_PATH ||
      path.join(__dirname, '..', '..', '..', 'docs', 'openapi', 'ms-returns-audit.yaml'),
  };
}

module.exports = { loadConfig };
