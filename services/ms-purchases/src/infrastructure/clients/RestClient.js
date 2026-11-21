// Cliente REST para consultar a otros microservicios por la red interna
// (Entrega 2, §1.2: ms-purchases -> ms-products / ms-suppliers, solo lectura).
// Usa fetch (incluido en Node 20). Las llamadas internas no pasan por el gateway.
const { ServiceUnavailableError } = require('../../domain/errors');

class RestClient {
  constructor({ baseUrl, serviceName, timeoutMs = 3000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.serviceName = serviceName;
    this.timeoutMs = timeoutMs;
  }

  // Devuelve el recurso, null si no existe (404), o lanza 503 si el servicio falla.
  async get(path) {
    let res;
    try {
      res = await fetch(this.baseUrl + path, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableError(`${this.serviceName} no está disponible; intente más tarde`);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new ServiceUnavailableError(`${this.serviceName} respondió con error ${res.status}`);
    return res.json();
  }
}

// Adaptadores de los puertos que usa PurchaseService.
class SupplierClient {
  constructor(rest) {
    this.rest = rest;
  }

  getSupplier(id) {
    return this.rest.get(`/api/v1/suppliers/${id}`);
  }
}

class ProductClient {
  constructor(rest) {
    this.rest = rest;
  }

  getProduct(id) {
    return this.rest.get(`/api/v1/products/${id}`);
  }
}

module.exports = { RestClient, SupplierClient, ProductClient };
