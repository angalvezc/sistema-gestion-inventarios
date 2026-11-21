// Casos de uso de las órdenes de compra (RF09, RF10).
// Puertos que recibe:
//   orderRepository -> persistencia y transacciones (db_purchases)
//   supplierClient  -> consulta a ms-suppliers por REST
//   productClient   -> consulta a ms-products por REST
const { NotFoundError, ValidationError } = require('../domain/errors');
const { STATUS, assertUuid, assertTransition, validateOrderInput, computeTotal } = require('../domain/order');
const { EVENTS, purchaseReceivedPayload } = require('../domain/events');
const { parsePagination } = require('./pagination');

const STATUS_VALUES = Object.values(STATUS);

class PurchaseService {
  constructor({ orderRepository, supplierClient, productClient, warehouseIds }) {
    this.repo = orderRepository;
    this.suppliers = supplierClient;
    this.products = productClient;
    this.warehouseIds = warehouseIds;
  }

  // ---------------- Consultas ----------------

  async list(query = {}) {
    const { page, size } = parsePagination(query);
    if (query.status && !STATUS_VALUES.includes(query.status)) {
      throw new ValidationError(`status debe ser uno de ${STATUS_VALUES.join(', ')}`);
    }
    if (query.supplierId) assertUuid(query.supplierId, 'supplierId');
    const { items, total } = await this.repo.findPage({
      status: query.status, supplierId: query.supplierId, limit: size, offset: page * size,
    });
    return { content: items, page, size, totalElements: total };
  }

  async get(id) {
    assertUuid(id);
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundError('Orden de compra no encontrada');
    return order;
  }

  // ---------------- Comandos ----------------

  // RF09: crea la orden en DRAFT. Antes valida por REST (Entrega 2, §1.2) que el
  // proveedor y los productos existan y estén activos, y copia el SKU de cada producto.
  // Si ms-suppliers o ms-products no responden, lanza 503 (RNF09).
  async create(input, user) {
    const data = validateOrderInput(input, this.warehouseIds);

    const [supplier, products] = await Promise.all([
      this.suppliers.getSupplier(data.supplierId),
      Promise.all(data.items.map((it) => this.products.getProduct(it.productId))),
    ]);

    const details = [];
    if (!supplier) details.push('supplierId: el proveedor no existe');
    else if (!supplier.active) details.push('supplierId: el proveedor está dado de baja');
    products.forEach((p, i) => {
      if (!p) details.push(`items[${i}].productId: el producto no existe`);
      else if (!p.active) details.push(`items[${i}].productId: el producto ${p.sku} está dado de baja`);
    });
    if (details.length > 0) throw new ValidationError('No se puede crear la orden', details);

    const items = data.items.map((it, i) => ({ ...it, sku: products[i].sku }));
    return this.repo.create({
      supplierId: data.supplierId,
      destinationWarehouseId: data.destinationWarehouseId,
      totalAmount: computeTotal(items),
      createdBy: user.id,
      items,
    });
  }

  approve(id, user) {
    return this.#transition(id, STATUS.APPROVED, user);
  }

  cancel(id, user) {
    return this.#transition(id, STATUS.CANCELLED, user);
  }

  // RF10: APPROVED -> RECEIVED y, en la MISMA transacción, el evento purchase.received
  // queda en el outbox para que ms-inventory-stock sume la mercancía.
  receive(id, user) {
    return this.#transition(id, STATUS.RECEIVED, user, async (tx, order) => {
      const items = await tx.getItems(id);
      await tx.addOutboxEvent(EVENTS.PURCHASE_RECEIVED, purchaseReceivedPayload(order, items, user));
    });
  }

  // Cambio de estado seguro ante peticiones simultáneas: lockOrder bloquea la fila
  // (SELECT ... FOR UPDATE). Si dos operarios reciben la misma orden a la vez, el
  // segundo espera, ve RECEIVED y obtiene 409: el evento nunca sale dos veces.
  async #transition(id, targetStatus, user, afterUpdate) {
    assertUuid(id);
    await this.repo.withTransaction(async (tx) => {
      const order = await tx.lockOrder(id);
      if (!order) throw new NotFoundError('Orden de compra no encontrada');
      assertTransition(order.status, targetStatus);

      await tx.updateStatus(id, targetStatus, user.id);
      await tx.insertHistory(id, order.status, targetStatus, user.id);
      if (afterUpdate) await afterUpdate(tx, order);
    });
    return this.get(id);
  }
}

module.exports = { PurchaseService };
