// Punto de entrada: prepara la base con el usuario dueño, y luego trabaja con el rol
// restringido audit_runtime (RNF12).
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const { loadConfig } = require('./config');
const { createPool, waitForDatabase } = require('./infrastructure/db/pool');
const { runMigrations } = require('./infrastructure/db/migrate');
const { ensureRuntimeRole } = require('./infrastructure/db/runtimeRole');
const { PgKardexRepository } = require('./infrastructure/db/PgKardexRepository');
const { PgReturnRepository } = require('./infrastructure/db/PgReturnRepository');
const { RestClient } = require('./infrastructure/clients/RestClient');
const { ProductCatalog } = require('./infrastructure/clients/ProductCatalog');
const { KardexService } = require('./application/KardexService');
const { ReturnService } = require('./application/ReturnService');
const { DashboardService } = require('./application/DashboardService');
const { createApp } = require('./infrastructure/http/app');
const { RabbitMQConnection } = require('./infrastructure/messaging/RabbitMQConnection');
const { OutboxPublisher } = require('./infrastructure/messaging/OutboxPublisher');
const { KardexConsumer } = require('./infrastructure/messaging/KardexConsumer');
const { declareOutboundQueues } = require('./infrastructure/messaging/topology');

function loadOpenapi(filePath) {
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`[ms-returns-audit] No se encontró el contrato OpenAPI en ${filePath}; /docs deshabilitado`);
    return null;
  }
}

// 1) Con el DUEÑO: crea/actualiza el rol restringido y aplica las migraciones
//    (tablas, trigger, REVOKE y GRANT). Después esa conexión se cierra.
async function prepareDatabase(config) {
  const ownerPool = createPool(config.ownerDb);
  try {
    await waitForDatabase(ownerPool);
    await ensureRuntimeRole(ownerPool, config.runtimeDb.password);
    await runMigrations(ownerPool, path.join(__dirname, '..', 'migrations'));
  } finally {
    await ownerPool.end();
  }
}

function startMessaging(config, pool, kardexService) {
  if (!config.rabbitmq.url) {
    console.warn('[ms-returns-audit] RABBITMQ_URL no definida: mensajería deshabilitada');
    return { stop: async () => {} };
  }
  const consumer = new KardexConsumer({ kardexService, exchange: config.rabbitmq.exchange });
  const rabbit = new RabbitMQConnection({
    url: config.rabbitmq.url,
    exchange: config.rabbitmq.exchange,
    onConnected: async (connection) => {
      await declareOutboundQueues(connection, config.rabbitmq.exchange);
      await consumer.setup(connection);
    },
  });
  const outbox = new OutboxPublisher({ pool, rabbit, producer: 'ms-returns-audit', ...config.outbox });
  rabbit.start();
  outbox.start();
  return {
    stop: async () => {
      outbox.stop();
      await rabbit.close();
    },
  };
}

async function main() {
  const config = loadConfig();
  await prepareDatabase(config);

  // 2) Todo el servicio trabaja con audit_runtime.
  const pool = createPool(config.runtimeDb);
  await waitForDatabase(pool);

  const productCatalog = new ProductCatalog(new RestClient({
    baseUrl: config.productsUrl, serviceName: 'ms-products', timeoutMs: config.serviceTimeoutMs,
  }));
  const kardexRepository = new PgKardexRepository(pool);
  const kardexService = new KardexService({ kardexRepository, productCatalog });
  const returnService = new ReturnService({
    returnRepository: new PgReturnRepository(pool), productCatalog, warehouseIds: config.warehouseIds,
  });
  const dashboardService = new DashboardService({ kardexRepository, productCatalog, timezone: config.timezone });
  const messaging = startMessaging(config, pool, kardexService);

  const app = createApp({
    kardexService,
    returnService,
    dashboardService,
    healthCheck: () => pool.query('SELECT 1'),
    openapiDocument: loadOpenapi(config.openapiPath),
  });

  const server = app.listen(config.port, () => {
    console.log(`[ms-returns-audit] Escuchando en el puerto ${config.port} como ${config.runtimeDb.user}`);
  });

  const shutdown = () => {
    console.log('[ms-returns-audit] Cerrando...');
    server.close(async () => {
      await messaging.stop();
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[ms-returns-audit] Error al iniciar:', err.message);
  process.exit(1);
});
