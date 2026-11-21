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
  return {
    port: Number(process.env.PORT || 8085),
    db: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
    },
    // Servicios que se consultan por REST al crear una orden (Entrega 2, §1.2).
    services: {
      productsUrl: process.env.PRODUCTS_URL || 'http://ms-products:8082',
      suppliersUrl: process.env.SUPPLIERS_URL || 'http://ms-suppliers:8084',
      timeoutMs: Number(process.env.SERVICE_TIMEOUT_MS || 3000),
    },
    // Bodegas válidas como destino de una orden (BOD-A = 1, BOD-B = 2).
    warehouseIds: (process.env.WAREHOUSE_IDS || '1,2').split(',').map((v) => Number(v.trim())).filter(Number.isInteger),
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
      path.join(__dirname, '..', '..', '..', 'docs', 'openapi', 'ms-purchases.yaml'),
  };
}

module.exports = { loadConfig };
