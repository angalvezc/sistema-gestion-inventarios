// Punto de entrada: conecta los adaptadores con los casos de uso y arranca el servidor.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const { loadConfig } = require('./config');
const { createPool, waitForDatabase } = require('./infrastructure/db/pool');
const { runMigrations } = require('./infrastructure/db/migrate');
const { PgStockRepository } = require('./infrastructure/db/PgStockRepository');
const { StockService } = require('./application/StockService');
const { createApp } = require('./infrastructure/http/app');

function loadOpenapi(filePath) {
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`[ms-inventory-stock] No se encontró el contrato OpenAPI en ${filePath}; /docs deshabilitado`);
    return null;
  }
}

async function main() {
  const config = loadConfig();

  const pool = createPool(config.db);
  await waitForDatabase(pool);
  await runMigrations(pool, path.join(__dirname, '..', 'migrations'));

  const stockService = new StockService({ stockRepository: new PgStockRepository(pool) });

  const app = createApp({
    stockService,
    healthCheck: () => pool.query('SELECT 1'),
    openapiDocument: loadOpenapi(config.openapiPath),
  });

  const server = app.listen(config.port, () => {
    console.log(`[ms-inventory-stock] Escuchando en el puerto ${config.port}`);
  });

  // Apagado ordenado: Kubernetes envía SIGTERM antes de detener un pod.
  const shutdown = () => {
    console.log('[ms-inventory-stock] Cerrando...');
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[ms-inventory-stock] Error al iniciar:', err.message);
  process.exit(1);
});
