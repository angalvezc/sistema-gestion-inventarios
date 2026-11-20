// Formato único de error (Entrega 2, §2.2), igual al de los microservicios.
function sendError(req, res, status, code, message, details = null) {
  res.status(status).json({
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
}

module.exports = { sendError };
