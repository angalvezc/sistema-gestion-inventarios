// Casos de uso de devoluciones y garantías (RF11).
const { ValidationError } = require('../domain/errors');
const { ORIGINS, validateReturn } = require('../domain/returns');
const { EVENTS, returnProcessedPayload } = require('../domain/events');
const { parsePagination } = require('./pagination');

class ReturnService {
  constructor({ returnRepository, productCatalog, warehouseIds }) {
    this.repo = returnRepository;
    this.catalog = productCatalog;
    this.warehouseIds = warehouseIds;
  }

  // Registra la devolución y, en la MISMA transacción, deja return.processed en el
  // outbox: ms-inventory-stock reingresa los ítems RESTOCK; los DAMAGED son baja.
  async create(input, user) {
    const data = validateReturn(input, this.warehouseIds);

    // Los productos deben existir (si ms-products no responde: 503, RNF09).
    const ids = [...new Set(data.items.map((it) => it.productId))];
    const products = await Promise.all(ids.map((id) => this.catalog.getProduct(id)));
    const missing = ids.filter((id, i) => !products[i]);
    if (missing.length > 0) {
      throw new ValidationError('No se puede registrar la devolución', missing.map((id) => `productId ${id}: el producto no existe`));
    }

    const id = await this.repo.withTransaction(async (tx) => {
      const ret = await tx.insertReturn({ origin: data.origin, reason: data.reason, createdBy: user.id });
      for (const item of data.items) await tx.insertItem(ret.id, item);
      await tx.addOutboxEvent(EVENTS.RETURN_PROCESSED, returnProcessedPayload({ ...ret, items: data.items }, user));
      return ret.id;
    });
    return this.repo.findById(id);
  }

  async list(query = {}) {
    const { page, size } = parsePagination(query);
    if (query.origin && !ORIGINS.includes(query.origin)) {
      throw new ValidationError(`origin debe ser uno de ${ORIGINS.join(', ')}`);
    }
    const { items, total } = await this.repo.findPage({ origin: query.origin, limit: size, offset: page * size });
    return { content: items, page, size, totalElements: total };
  }
}

module.exports = { ReturnService };
