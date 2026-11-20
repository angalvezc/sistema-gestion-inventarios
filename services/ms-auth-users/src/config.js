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
    port: Number(process.env.PORT || 8081),
    db: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      database: required('DB_NAME'),
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
    },
    jwt: {
      secret: required('JWT_SECRET'),
      accessTtl: Number(process.env.JWT_ACCESS_TTL || 900), // 15 minutos
      refreshTtl: Number(process.env.JWT_REFRESH_TTL || 604800), // 7 días
    },
    // Usuario administrador inicial: solo se crea si la tabla de usuarios está vacía.
    admin: {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      fullName: process.env.ADMIN_FULL_NAME || 'Administrador del sistema',
    },
    openapiPath:
      process.env.OPENAPI_PATH ||
      path.join(__dirname, '..', '..', '..', 'docs', 'openapi', 'ms-auth-users.yaml'),
  };
}

module.exports = { loadConfig };
