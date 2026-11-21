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
    port: Number(process.env.PORT || 8084),
    db: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
    },
    openapiPath:
      process.env.OPENAPI_PATH ||
      path.join(__dirname, '..', '..', '..', 'docs', 'openapi', 'ms-suppliers.yaml'),
  };
}

module.exports = { loadConfig };
