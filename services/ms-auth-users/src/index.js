// Punto de entrada: conecta los adaptadores con los casos de uso y arranca el servidor.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const { loadConfig } = require('./config');
const { createPool, waitForDatabase } = require('./infrastructure/db/pool');
const { runMigrations } = require('./infrastructure/db/migrate');
const { PgUserRepository } = require('./infrastructure/db/PgUserRepository');
const { PgRefreshTokenRepository } = require('./infrastructure/db/PgRefreshTokenRepository');
const { BcryptPasswordHasher } = require('./infrastructure/security/BcryptPasswordHasher');
const { JwtTokenService } = require('./infrastructure/security/JwtTokenService');
const { AuthService } = require('./application/AuthService');
const { UserService } = require('./application/UserService');
const { createApp } = require('./infrastructure/http/app');

function loadOpenapi(filePath) {
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`[ms-auth-users] No se encontró el contrato OpenAPI en ${filePath}; /docs deshabilitado`);
    return null;
  }
}

async function main() {
  const config = loadConfig();

  const pool = createPool(config.db);
  await waitForDatabase(pool);
  await runMigrations(pool, path.join(__dirname, '..', 'migrations'));

  const userRepository = new PgUserRepository(pool);
  const refreshTokenRepository = new PgRefreshTokenRepository(pool);
  const passwordHasher = new BcryptPasswordHasher();
  const tokenService = new JwtTokenService(config.jwt);

  const authService = new AuthService({ userRepository, refreshTokenRepository, passwordHasher, tokenService });
  const userService = new UserService({ userRepository, refreshTokenRepository, passwordHasher });
  await userService.ensureInitialAdmin(config.admin);

  const app = createApp({
    authService,
    userService,
    healthCheck: () => pool.query('SELECT 1'),
    openapiDocument: loadOpenapi(config.openapiPath),
  });

  const server = app.listen(config.port, () => {
    console.log(`[ms-auth-users] Escuchando en el puerto ${config.port}`);
  });

  // Apagado ordenado: Kubernetes envía SIGTERM antes de detener un pod.
  const shutdown = () => {
    console.log('[ms-auth-users] Cerrando...');
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[ms-auth-users] Error al iniciar:', err.message);
  process.exit(1);
});
