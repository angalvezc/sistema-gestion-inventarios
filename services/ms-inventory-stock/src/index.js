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
const { RabbitMQConnection } = require('./infrastructure/messaging/RabbitMQConnection');
const { OutboxPublisher } = require('./infrastructure/messaging/OutboxPublisher');
const { StockEventConsumer } = require('./infrastructure/messaging/StockEventConsumer');
const { declareOutboundQueues } = require('./infrastructure/messaging/topology');

// Conecta la mensajería. No bloquea el arranque: si RabbitMQ no está, se reintenta en segundo plano.
function startMessaging(config, pool, stockService) {
  if (!config.rabbitmq.url) {
    console.warn('[ms-inventory-stock] RABBITMQ_URL no definida: mensajería deshabilitada (los eventos quedan en outbox_event)');
    return { stop: async () => {} };
  }
  const consumer = new StockEventConsumer({ stockService, exchange: config.rabbitmq.exchange });
  const rabbit = new RabbitMQConnection({
    url: config.rabbitmq.url,
    exchange: config.rabbitmq.exchange,
    // En cada (re)conexión: primero las colas de destino, luego los consumidores propios.
    onConnected: async (connection) => {
      await declareOutboundQueues(connection, config.rabbitmq.exchange);
      await consumer.setup(connection);
    },
  });
  const outbox = new OutboxPublisher({ pool, rabbit, producer: 'ms-inventory-stock', ...config.outbox });

  rabbit.start();
  outbox.start();
  return {
    stop: async () => {
      outbox.stop();
      await rabbit.close();
    },
  };
}

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
  const messaging = startMessaging(config, pool, stockService);

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
  console.error('[ms-inventory-stock] Error al iniciar:', err.message);
  process.exit(1);
});
