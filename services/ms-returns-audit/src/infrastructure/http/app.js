// Construye la aplicación Express: salud, documentación y rutas de negocio.
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { auditRoutes } = require('./auditRoutes');
const { notFoundHandler, errorHandler } = require('./errorHandler');

function createApp({ kardexService, returnService, dashboardService, healthCheck, openapiDocument }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Salud (Entrega 2, §4.1): live = el proceso responde; ready = además llega a db_audit.
  app.get('/health/live', (req, res) => res.json({ status: 'UP' }));
  app.get('/health/ready', async (req, res) => {
    try {
      await healthCheck();
      res.json({ status: 'UP' });
    } catch {
      res.status(503).json({ status: 'DOWN' });
    }
  });

  // Swagger UI del servicio (RNF13)
  if (openapiDocument) {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));
  }

  app.use('/api/v1/audit', auditRoutes({ kardexService, returnService, dashboardService }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
