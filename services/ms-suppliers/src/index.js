// Punto de entrada: conecta los adaptadores con los casos de uso y arranca el servidor.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const { loadConfig } = require('./config');
const { createPool, waitForDatabase } = require('./infrastructure/db/pool');
const { runMigrations } = require('./infrastructure/db/migrate');
const { PgSupplierRepository } = require('./infrastructure/db/PgSupplierRepository');
const { SupplierService } = require('./application/SupplierService');
const { createApp } = require('./infrastructure/http/app');

function loadOpenapi(filePath) {
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`[ms-suppliers] No se encontró el contrato OpenAPI en ${filePath}; /docs deshabilitado`);
    return null;
  }
}

async function main() {
  const config = loadConfig();

  const pool = createPool(config.db);
  await waitForDatabase(pool);
  await runMigrations(pool, path.join(__dirname, '..', 'migrations'));

  const supplierService = new SupplierService({ supplierRepository: new PgSupplierRepository(pool) });

  const app = createApp({
    supplierService,
    healthCheck: () => pool.query('SELECT 1'),
    openapiDocument: loadOpenapi(config.openapiPath),
  });

  const server = app.listen(config.port, () => {
    console.log(`[ms-suppliers] Escuchando en el puerto ${config.port}`);
  });

  // Apagado ordenado al recibir SIGTERM (docker compose stop).
  const shutdown = () => {
    console.log('[ms-suppliers] Cerrando...');
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[ms-suppliers] Error al iniciar:', err.message);
  process.exit(1);
});
