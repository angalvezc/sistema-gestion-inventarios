// Casos de uso de existencias (RF03-RF06).
// Depende de un puerto "stockRepository" que ofrece lecturas y withTransaction():
// todo lo que ocurre dentro del callback se confirma junto o se deshace junto.
const { NotFoundError, InsufficientStockError, ValidationError } = require('../domain/errors');
const {
  DECREASING_TYPES,
  isUuid,
  assertUuid,
  assertValidMovement,
  assertValidTransfer,
  assertValidThreshold,
  assertValidPurchaseReceived,
  assertValidReturnProcessed,
  alertStatus,
} = require('../domain/stock');
const { EVENTS, movementCreatedPayload, stockLowPayload } = require('../domain/events');
const { parsePagination } = require('./pagination');

const withStatus = (level) => ({ ...level, status: alertStatus(level.quantity, level.minThreshold) });

// Usuario que originó un evento de otro servicio (opcional en el payload).
const eventUser = (payload) => ({
  id: isUuid(payload.userId) ? payload.userId : null,
  email: payload.userEmail || null,
});

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

  // ---------------- Eventos entrantes (RabbitMQ) ----------------

  // RF10: al recibir una orden de compra, cada ítem entra a la bodega destino.
  async applyPurchaseReceived(event) {
    const p = event.payload;
    assertValidPurchaseReceived(p);
    await this.#assertWarehouseExists(p.warehouseId);
    const reference = String(p.orderNumber || `OC ${p.orderId}`).slice(0, 100);
    const entries = p.items.map((i) => ({ productId: i.productId, warehouseId: p.warehouseId, quantity: i.quantity }));
    return this.#applyIncomingEvent(event, entries, 'ENTRY', reference, eventUser(p));
  }

  // RF11: solo los ítems RESTOCK vuelven al inventario; DAMAGED es baja por avería.
  async applyReturnProcessed(event) {
    const p = event.payload;
    assertValidReturnProcessed(p);
    const restock = p.items.filter((i) => i.disposition === 'RESTOCK');
    await Promise.all([...new Set(restock.map((i) => i.warehouseId))].map((id) => this.#assertWarehouseExists(id)));
    const reference = String(`DEV ${p.returnNumber || p.returnId}`).slice(0, 100);
    const entries = restock.map((i) => ({ productId: i.productId, warehouseId: i.warehouseId, quantity: i.quantity }));
    return this.#applyIncomingEvent(event, entries, 'RETURN_IN', reference, eventUser(p));
  }

  // Todo el evento se aplica en una transacción: todos los ítems o ninguno.
  // markEventProcessed hace que un evento repetido no sume dos veces (idempotencia).
  async #applyIncomingEvent(event, entries, type, reference, user) {
    return this.repo.withTransaction(async (tx) => {
      if (!(await tx.markEventProcessed(event.eventId, event.eventType))) {
        return { duplicate: true, movements: 0 };
      }
      for (const entry of entries) {
        const level = await tx.increase(entry.productId, entry.warehouseId, entry.quantity);
        await this.#recordMovement(tx, { ...entry, type, reference, level, user });
      }
      return { duplicate: false, movements: entries.length };
    });
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
