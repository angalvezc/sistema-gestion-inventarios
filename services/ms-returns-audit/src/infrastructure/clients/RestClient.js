// Cliente REST para consultar a ms-products por la red interna (sin pasar por el gateway).
// Usa fetch (incluido en Node 20).
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

module.exports = { RestClient };
