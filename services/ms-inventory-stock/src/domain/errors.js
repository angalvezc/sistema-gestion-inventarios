// Errores de dominio (mismo esquema que ms-auth-users). Cada uno sabe su código
// HTTP, pero no depende de Express: la capa HTTP solo los traduce.

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

// RF04: una salida o transferencia no puede dejar el saldo negativo.
class InsufficientStockError extends DomainError {
  constructor(available, requested) {
    super(409, 'INSUFFICIENT_STOCK', 'Saldo insuficiente en la bodega', { available, requested });
  }
}

module.exports = {
  DomainError,
  ValidationError,
  NotFoundError,
  InsufficientStockError,
};
