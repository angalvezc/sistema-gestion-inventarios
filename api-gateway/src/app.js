// Ensambla el gateway: salud, logs, rate limiting, autorización y proxy.
const express = require('express');
const { matchRoute } = require('./routeTable');
const { createRateLimiter } = require('./rateLimiter');
const { authorize } = require('./authorize');
const { forward } = require('./proxy');
const { sendError } = require('./errors');

function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // Salud del propio gateway. No depende de los microservicios: si uno cae,
  // el gateway sigue "listo" y atiende las rutas de los demás (RNF09).
  app.get('/health/live', (req, res) => res.json({ status: 'UP' }));
  app.get('/health/ready', (req, res) => res.json({ status: 'UP' }));

  // Log de acceso: método, ruta, estado, duración y usuario.
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const user = req.user ? req.user.email : '-';
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms ${user}`);
    });
    next();
  });

  // El cuerpo se lee como bytes sin interpretar y se reenvía tal cual.
  app.use(express.raw({ type: () => true, limit: '1mb' }));

  const rateLimiter = createRateLimiter(config.rateLimit);

  app.all('/api/v1/*', rateLimiter, async (req, res, next) => {
    try {
      const match = matchRoute(req.method, req.path);
      if (match.status === 404) return sendError(req, res, 404, 'NOT_FOUND', 'Ruta no encontrada');
      if (match.status === 405) return sendError(req, res, 405, 'METHOD_NOT_ALLOWED', `Método ${req.method} no permitido en esta ruta`);

      if (!authorize(req, res, match.rule, config.jwtSecret)) return undefined;

      return await forward(req, res, {
        baseUrl: config.services[match.rule.service],
        timeoutMs: config.upstreamTimeoutMs,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.use((req, res) => sendError(req, res, 404, 'NOT_FOUND', 'Ruta no encontrada'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return sendError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera el tamaño permitido (1 MB)');
    }
    console.error('[api-gateway] Error no controlado:', err);
    return sendError(req, res, 500, 'INTERNAL_ERROR', 'Error interno del gateway');
  });

  return app;
}

module.exports = { createApp };
