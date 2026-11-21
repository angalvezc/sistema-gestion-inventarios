// Formato único de error (Entrega 2, §2.2): { code, message, details, timestamp, path }
const { DomainError } = require('../../domain/errors');

function errorBody(req, code, message, details = null) {
  return { code, message, details, timestamp: new Date().toISOString(), path: req.originalUrl };
}

// Express 4 no captura errores de funciones async; este envoltorio los pasa a next().
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, res) {
  res.status(404).json(errorBody(req, 'NOT_FOUND', 'Ruta no encontrada'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof DomainError) {
    return res.status(err.status).json(errorBody(req, err.code, err.message, err.details));
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody(req, 'VALIDATION_ERROR', 'El cuerpo no es un JSON válido'));
  }
  console.error('[ms-purchases] Error no controlado:', err);
  return res.status(500).json(errorBody(req, 'INTERNAL_ERROR', 'Error interno del servidor'));
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
