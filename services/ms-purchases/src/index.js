// Punto de entrada: conecta los adaptadores con los casos de uso y arranca el servidor.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const { loadConfig } = require('./config');
const { createPool, waitForDatabase } = require('./infrastructure/db/pool');
const { runMigrations } = require('./infrastructure/db/migrate');
const { PgOrderRepository } = require('./infrastructure/db/PgOrderRepository');
const { RestClient, SupplierClient, ProductClient } = require('./infrastructure/clients/RestClient');
const { PurchaseService } = require('./application/PurchaseService');
const { createApp } = require('./infrastructure/http/app');
const { RabbitMQConnection } = require('./infrastructure/messaging/RabbitMQConnection');
const { OutboxPublisher } = require('./infrastructure/messaging/OutboxPublisher');
const { declareOutboundQueues } = require('./infrastructure/messaging/topology');

function loadOpenapi(filePath) {
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`[ms-purchases] No se encontró el contrato OpenAPI en ${filePath}; /docs deshabilitado`);
    return null;
  }
}

// Publicación de purchase.received. No bloquea el arranque: sin RabbitMQ, los
// eventos esperan en outbox_event y se reintenta la conexión en segundo plano.
function startMessaging(config, pool) {
  if (!config.rabbitmq.url) {
    console.warn('[ms-purchases] RABBITMQ_URL no definida: los eventos quedan en outbox_event');
    return { stop: async () => {} };
  }
  const rabbit = new RabbitMQConnection({
    url: config.rabbitmq.url,
    exchange: config.rabbitmq.exchange,
    onConnected: (connection) => declareOutboundQueues(connection, config.rabbitmq.exchange),
  });
  const outbox = new OutboxPublisher({ pool, rabbit, producer: 'ms-purchases', ...config.outbox });
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

  const pool = createPool(config.db);
  await waitForDatabase(pool);
  await runMigrations(pool, path.join(__dirname, '..', 'migrations'));

  const { productsUrl, suppliersUrl, timeoutMs } = config.services;
  const purchaseService = new PurchaseService({
    orderRepository: new PgOrderRepository(pool),
    supplierClient: new SupplierClient(new RestClient({ baseUrl: suppliersUrl, serviceName: 'ms-suppliers', timeoutMs })),
    productClient: new ProductClient(new RestClient({ baseUrl: productsUrl, serviceName: 'ms-products', timeoutMs })),
    warehouseIds: config.warehouseIds,
  });
  const messaging = startMessaging(config, pool);

  const app = createApp({
    purchaseService,
    healthCheck: () => pool.query('SELECT 1'),
    openapiDocument: loadOpenapi(config.openapiPath),
  });

  const server = app.listen(config.port, () => {
    console.log(`[ms-purchases] Escuchando en el puerto ${config.port}; bodegas válidas: ${config.warehouseIds.join(', ')}`);
  });

  const shutdown = () => {
    console.log('[ms-purchases] Cerrando...');
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
  console.error('[ms-purchases] Error al iniciar:', err.message);
  process.exit(1);
});
