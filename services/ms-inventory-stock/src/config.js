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
    port: Number(process.env.PORT || 8083),
    db: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
    },
    // Mensajería (RNF08). Si RABBITMQ_URL no está definida, el servicio funciona solo por REST
    // y los eventos se acumulan en outbox_event hasta que haya broker.
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
      path.join(__dirname, '..', '..', '..', 'docs', 'openapi', 'ms-inventory-stock.yaml'),
  };
}

module.exports = { loadConfig };
