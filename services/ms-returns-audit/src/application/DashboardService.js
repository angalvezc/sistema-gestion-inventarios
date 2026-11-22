// Métricas consolidadas del dashboard (RF12).
// Se calculan con los datos del propio Kardex: el último balanceAfter de cada
// producto en cada bodega es su saldo actual. Los precios vienen de ms-products.
const { ServiceUnavailableError } = require('../domain/errors');

const PRICE_LOOKUP_CONCURRENCY = 10;

class DashboardService {
  constructor({ kardexRepository, productCatalog, timezone }) {
    this.repo = kardexRepository;
    this.catalog = productCatalog;
    this.timezone = timezone;
  }

  async metrics() {
    const [balances, movementsToday] = await Promise.all([
      this.repo.latestBalances(),
      this.repo.countMovementsToday(this.timezone),
    ]);

    const byProduct = new Map();
    const byWarehouse = new Map();
    balances.forEach(({ productId, warehouseId, balance }) => {
      byProduct.set(productId, (byProduct.get(productId) || 0) + balance);
      byWarehouse.set(warehouseId, (byWarehouse.get(warehouseId) || 0) + balance);
    });

    const inStock = [...byProduct.entries()].filter(([, units]) => units > 0);
    const value = await this.#inventoryValue(inStock);

    return {
      inventoryValue: value,                         // null si ms-products no respondió
      inventoryValueAvailable: value !== null,
      currency: 'COP',
      productsTracked: byProduct.size,
      outOfStockProducts: byProduct.size - inStock.length, // saldo total 0 en ambas bodegas
      totalUnits: [...byProduct.values()].reduce((a, b) => a + b, 0),
      unitsByWarehouse: [...byWarehouse.entries()].sort((a, b) => a[0] - b[0])
        .map(([warehouseId, units]) => ({ warehouseId, units })),
      movementsToday,                                // contados en hora de Colombia
      timezone: this.timezone,
      generatedAt: new Date().toISOString(),
    };
  }

  // Valor = suma de (saldo x precio base). Si ms-products no responde, se devuelve
  // null en vez de un valor incompleto (RNF09: el resto de métricas sigue funcionando).
  async #inventoryValue(products) {
    let cents = 0;
    try {
      for (let i = 0; i < products.length; i += PRICE_LOOKUP_CONCURRENCY) {
        const chunk = products.slice(i, i + PRICE_LOOKUP_CONCURRENCY);
        const found = await Promise.all(chunk.map(([id]) => this.catalog.getProduct(id)));
        found.forEach((product, j) => {
          if (product) cents += chunk[j][1] * Math.round(product.basePrice * 100);
        });
      }
    } catch (err) {
      if (!(err instanceof ServiceUnavailableError)) throw err;
      console.warn('[dashboard] ms-products no disponible: valor del inventario no calculado');
      return null;
    }
    return cents / 100;
  }
}

module.exports = { DashboardService };
