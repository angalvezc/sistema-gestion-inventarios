// Punto de entrada del API Gateway.
const { loadConfig } = require('./config');
const { createApp } = require('./app');

function main() {
  const config = loadConfig();
  const app = createApp(config);

  const server = app.listen(config.port, () => {
    console.log(`[api-gateway] Escuchando en el puerto ${config.port}`);
    Object.entries(config.services).forEach(([name, url]) => console.log(`[api-gateway]   ${name} -> ${url}`));
  });

  const shutdown = () => {
    console.log('[api-gateway] Cerrando...');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

try {
  main();
} catch (err) {
  console.error('[api-gateway] Error al iniciar:', err.message);
  process.exit(1);
}
