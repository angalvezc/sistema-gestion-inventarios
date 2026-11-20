// Reenvía la petición al microservicio destino usando fetch (incluido en Node 20).
const { sendError } = require('./errors');

// Encabezados que no deben pasar al microservicio.
const BLOCKED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'content-length', // fetch lo recalcula
  'authorization', // el JWT ya se validó aquí; el servicio recibe la identidad en X-User-*
]);

// Encabezados de la respuesta del microservicio que se devuelven al cliente.
const PASSTHROUGH_RESPONSE_HEADERS = ['content-type', 'location', 'retry-after'];

function buildHeaders(req) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    // Se descartan los X-User-* que mande el cliente: si no, podría hacerse pasar por ADMIN.
    if (!BLOCKED_HEADERS.has(name) && !name.startsWith('x-user-')) headers[name] = value;
  }
  if (req.user) {
    headers['x-user-id'] = req.user.id;
    headers['x-user-email'] = req.user.email;
    headers['x-user-role'] = req.user.role;
  }
  return headers;
}

async function forward(req, res, { baseUrl, timeoutMs }) {
  const hasBody = Buffer.isBuffer(req.body) && req.body.length > 0 && !['GET', 'HEAD'].includes(req.method);

  let upstream;
  try {
    upstream = await fetch(baseUrl + req.originalUrl, {
      method: req.method,
      headers: buildHeaders(req),
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Aislamiento de fallas (RNF09): si un servicio no responde, solo fallan SUS rutas.
    if (err.name === 'TimeoutError') {
      return sendError(req, res, 504, 'GATEWAY_TIMEOUT', 'El servicio no respondió a tiempo');
    }
    return sendError(req, res, 503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible en este momento');
  }

  res.status(upstream.status);
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  return body.length > 0 ? res.send(body) : res.end();
}

module.exports = { forward };
