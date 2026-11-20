// Casos de uso de existencias (RF03-RF06).
// Depende de un puerto "stockRepository" que ofrece lecturas y withTransaction():
// todo lo que ocurre dentro del callback se confirma junto o se deshace junto.
const { NotFoundError, InsufficientStockError, ValidationError } = require('../domain/errors');
const {
  DECREASING_TYPES,
  assertUuid,
  assertValidMovement,
  assertValidTransfer,
  assertValidThreshold,
  alertStatus,
} = require('../domain/stock');
const { EVENTS, movementCreatedPayload, stockLowPayload } = require('../domain/events');
const { parsePagination } = require('./pagination');

const withStatus = (level) => ({ ...level, status: alertStatus(level.quantity, level.minThreshold) });

class StockService {
  constructor({ stockRepository }) {
    this.repo = stockRepository;
  }

  // ---------------- Consultas ----------------

  async listStock(query = {}) {
    const { page, size } = parsePagination(query);
    const filters = {
      warehouseId: this.#optionalId(query.warehouseId, 'warehouseId'),
      productId: query.productId ? (assertUuid(query.productId), query.productId) : undefined,
    };
    const { items, total } = await this.repo.findPage({ ...filters, limit: size, offset: page * size });
    return { content: items.map(withStatus), page, size, totalElements: total };
  }

  // Saldo del producto en TODAS las bodegas (0 si nunca ha tenido movimientos en una).
  async getProductStock(productId) {
    assertUuid(productId);
    const [warehouses, levels] = await Promise.all([
      this.repo.listWarehouses(),
      this.repo.findByProduct(productId),
    ]);
    const byWarehouse = new Map(levels.map((l) => [l.warehouseId, l]));
    const detail = warehouses.map((w) => {
      const level = byWarehouse.get(w.id) || { quantity: 0, minThreshold: 0, updatedAt: null };
      return {
        warehouseId: w.id,
        warehouseCode: w.code,
        warehouseName: w.name,
        city: w.city,
        quantity: level.quantity,
        minThreshold: level.minThreshold,
        status: alertStatus(level.quantity, level.minThreshold),
        updatedAt: level.updatedAt,
      };
    });
    return {
      productId,
      totalQuantity: detail.reduce((sum, d) => sum + d.quantity, 0),
      warehouses: detail,
    };
  }

  // RF06: productos bajo el mínimo o agotados.
  async listAlerts(query = {}) {
    const items = await this.repo.findAlerts({ warehouseId: this.#optionalId(query.warehouseId, 'warehouseId') });
    return items.map(withStatus);
  }

  listWarehouses() {
    return this.repo.listWarehouses();
  }

  // ---------------- Comandos ----------------

  // RF04: entrada o salida manual. La salida nunca deja saldo negativo.
  async registerMovement(input, user) {
    assertValidMovement(input);
    await this.#assertWarehouseExists(input.warehouseId);

    return this.repo.withTransaction(async (tx) => {
      const { productId, warehouseId, type, quantity } = input;
      const level = type === 'ENTRY'
        ? await tx.increase(productId, warehouseId, quantity)
        : await this.#decreaseOrFail(tx, productId, warehouseId, quantity);

      return this.#recordMovement(tx, {
        productId, warehouseId, type, quantity, reference: input.reference.trim(), level, user,
      });
    });
  }

  // RF05: transferencia entre bodegas en UNA transacción local (Entrega 2, §1.4).
  async transfer(input, user) {
    assertValidTransfer(input);
    const { productId, fromWarehouseId: from, toWarehouseId: to, quantity } = input;
    await Promise.all([this.#assertWarehouseExists(from), this.#assertWarehouseExists(to)]);

    return this.repo.withTransaction(async (tx) => {
      const transfer = await tx.insertTransfer({ fromWarehouseId: from, toWarehouseId: to, userId: user.id });
      const reference = (input.reference && input.reference.trim()) || `TRANSFERENCIA ${transfer.id}`;

      // Las filas se bloquean siempre en el mismo orden (bodega de id menor primero).
      // Así, una transferencia A->B y otra B->A simultáneas no se bloquean mutuamente (deadlock).
      let outLevel;
      let inLevel;
      if (from < to) {
        outLevel = await this.#decreaseOrFail(tx, productId, from, quantity);
        inLevel = await tx.increase(productId, to, quantity);
      } else {
        inLevel = await tx.increase(productId, to, quantity);
        outLevel = await this.#decreaseOrFail(tx, productId, from, quantity);
      }

      const common = { productId, quantity, reference, transferId: transfer.id, user };
      await this.#recordMovement(tx, { ...common, warehouseId: from, type: 'TRANSFER_OUT', level: outLevel });
      await this.#recordMovement(tx, { ...common, warehouseId: to, type: 'TRANSFER_IN', level: inLevel });

      return {
        id: transfer.id,
        productId,
        quantity,
        status: transfer.status,
        reference,
        from: { warehouseId: from, balanceAfter: outLevel.quantity },
        to: { warehouseId: to, balanceAfter: inLevel.quantity },
        createdAt: transfer.createdAt,
      };
    });
  }

  async setMinThreshold(productId, body = {}) {
    assertUuid(productId);
    assertValidThreshold(body);
    await this.#assertWarehouseExists(body.warehouseId);
    const level = await this.repo.upsertMinThreshold(productId, body.warehouseId, body.minThreshold);
    return withStatus(level);
  }

  // ---------------- Internos ----------------

  async #decreaseOrFail(tx, productId, warehouseId, quantity) {
    const level = await tx.decrease(productId, warehouseId, quantity);
    if (!level) {
      const available = await tx.getQuantity(productId, warehouseId);
      throw new InsufficientStockError(available, quantity);
    }
    return level;
  }

  // Guarda el movimiento y sus eventos en la misma transacción (patrón Outbox).
  async #recordMovement(tx, { productId, warehouseId, type, quantity, reference, transferId = null, level, user }) {
    const movement = await tx.insertMovement({
      productId, warehouseId, type, quantity, reference, transferId, balanceAfter: level.quantity, userId: user.id,
    });
    await tx.addOutboxEvent(EVENTS.MOVEMENT_CREATED, movementCreatedPayload(movement, user));

    // stock.low solo cuando una salida hace que el estado de alerta empeore.
    if (DECREASING_TYPES.includes(type)) {
      const before = alertStatus(level.quantity + quantity, level.minThreshold);
      const after = alertStatus(level.quantity, level.minThreshold);
      if (after && after !== before) {
        await tx.addOutboxEvent(EVENTS.STOCK_LOW, stockLowPayload({
          productId, warehouseId, quantity: level.quantity, minThreshold: level.minThreshold, status: after,
        }));
      }
    }
    return movement;
  }

  async #assertWarehouseExists(id) {
    if (!(await this.repo.findWarehouse(id))) throw new NotFoundError(`La bodega ${id} no existe`);
  }

  #optionalId(value, field) {
    if (value === undefined || value === '') return undefined;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`${field} debe ser un entero positivo`);
    return id;
  }
}

module.exports = { StockService };
