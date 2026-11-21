// Errores de dominio (mismo esquema que los demás microservicios). Cada uno sabe su
// código HTTP, pero no depende de Express: la capa HTTP solo los traduce.

class DomainError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends DomainError {
  constructor(message, details) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Recurso no encontrado') {
    super(404, 'NOT_FOUND', message);
  }
}

// RF02: SKU, código de barras o nombre de categoría duplicados.
class ConflictError extends DomainError {
  constructor(message, details) {
    super(409, 'CONFLICT', message, details);
  }
}

module.exports = { DomainError, ValidationError, NotFoundError, ConflictError };
