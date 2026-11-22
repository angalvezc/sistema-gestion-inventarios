// Consulta productos en ms-products (SKU para el Kardex, precios para el dashboard,
// existencia para las devoluciones). Guarda las respuestas 5 minutos en memoria
// para no llamar a ms-products por cada movimiento.
class ProductCatalog {
  constructor(restClient, ttlMs = 5 * 60 * 1000) {
    this.rest = restClient;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  async getProduct(id) {
    const hit = this.cache.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const value = await this.rest.get(`/api/v1/products/${id}`); // null si no existe; 503 si no responde
    if (value) this.cache.set(id, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }
}

module.exports = { ProductCatalog };
