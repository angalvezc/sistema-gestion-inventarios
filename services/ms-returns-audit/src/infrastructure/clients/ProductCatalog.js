// Consulta productos en ms-products (SKU para el Kardex, precios para el dashboard,
// existencia para las devoluciones) y guarda las respuestas en memoria para no
// llamar a ms-products en cada movimiento o en cada consulta del dashboard.
//   - producto encontrado: se guarda 5 minutos
//   - producto inexistente (404): también se guarda, 1 minuto. Sin esto, el dashboard
//     volvería a preguntar por cada producto desconocido en cada consulta.
//     Es más corto para que un producto recién creado se reconozca pronto.
class ProductCatalog {
  constructor(restClient, ttlMs = 5 * 60 * 1000, notFoundTtlMs = 60 * 1000) {
    this.rest = restClient;
    this.ttlMs = ttlMs;
    this.notFoundTtlMs = notFoundTtlMs;
    this.cache = new Map();
  }

  async getProduct(id) {
    const hit = this.cache.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await this.rest.get(`/api/v1/products/${id}`); // null si no existe; 503 si no responde
    this.cache.set(id, { value, expiresAt: Date.now() + (value ? this.ttlMs : this.notFoundTtlMs) });
    return value;
  }
}

module.exports = { ProductCatalog };
