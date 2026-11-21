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

// RF09: transición de estado no permitida (ej. recibir una orden en DRAFT).
class InvalidStateError extends DomainError {
  constructor(currentStatus, targetStatus) {
    super(409, 'INVALID_STATE', `No se puede pasar una orden de ${currentStatus} a ${targetStatus}`,
      { currentStatus, targetStatus });
  }
}

// RNF09: ms-products o ms-suppliers no responden; solo se bloquea crear órdenes.
class ServiceUnavailableError extends DomainError {
  constructor(message) {
    super(503, 'SERVICE_UNAVAILABLE', message);
  }
}

module.exports = { DomainError, ValidationError, NotFoundError, InvalidStateError, ServiceUnavailableError };
