// Rate limiting por IP con ventana fija (Entrega 2, §1.1: "rate limiting" en el Gateway).
// Cada IP puede hacer `max` peticiones por ventana; la siguiente recibe 429.
// Nota: el conteo vive en memoria de cada réplica del gateway.
const { sendError } = require('./errors');

function createRateLimiter({ max, windowMs }) {
  let windowStart = Date.now();
  let counts = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    if (now - windowStart >= windowMs) {
      // Nueva ventana: se reinician todos los contadores (y se libera memoria).
      windowStart = now;
      counts = new Map();
    }

    const used = (counts.get(req.ip) || 0) + 1;
    counts.set(req.ip, used);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - used));

    if (used > max) {
      res.setHeader('Retry-After', Math.ceil((windowStart + windowMs - now) / 1000));
      return sendError(req, res, 429, 'TOO_MANY_REQUESTS', 'Demasiadas peticiones, intente más tarde');
    }
    return next();
  };
}

module.exports = { createRateLimiter };
