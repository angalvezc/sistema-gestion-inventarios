// Errores de dominio. Cada uno sabe qué código HTTP le corresponde,
// pero no depende de Express: la capa HTTP solo los traduce.

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

class UnauthorizedError extends DomainError {
  constructor(message = 'No autenticado') {
    super(401, 'UNAUTHORIZED', message);
  }
}

class NotFoundError extends DomainError {
  constructor(message = 'Recurso no encontrado') {
    super(404, 'NOT_FOUND', message);
  }
}

class ConflictError extends DomainError {
  constructor(message) {
    super(409, 'CONFLICT', message);
  }
}

module.exports = {
  DomainError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
};
