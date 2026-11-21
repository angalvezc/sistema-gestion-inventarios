// Adaptador PostgreSQL de db_purchases.
//  - PgOrderRepository: lecturas, creación y apertura de transacciones.
//  - PgOrderTransaction: operaciones de un cambio de estado (deben ocurrir juntas).

const ORDER_SELECT = `
  SELECT id, order_number, supplier_id, destination_warehouse_id, status, total_amount,
         created_by, approved_by, created_at, received_at
  FROM purchase_order`;

function toOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    supplierId: row.supplier_id,
    destinationWarehouseId: row.destination_warehouse_id,
    status: row.status,
    totalAmount: Number(row.total_amount), // pg devuelve NUMERIC como texto
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    receivedAt: row.received_at,
  };
}

function toItem(row) {
  const unitCost = Number(row.unit_cost);
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku_snapshot,
    quantity: row.quantity,
    unitCost,
    subtotal: Math.round(row.quantity * unitCost * 100) / 100,
  };
}

const ITEMS_SQL = 'SELECT id, product_id, sku_snapshot, quantity, unit_cost FROM purchase_order_item WHERE order_id = $1 ORDER BY id';

class PgOrderTransaction {
  constructor(client) {
    this.client = client;
  }

  // Bloquea la fila hasta el COMMIT: otra transacción sobre la misma orden espera.
  async lockOrder(id) {
    const { rows } = await this.client.query(`${ORDER_SELECT} WHERE id = $1 FOR UPDATE`, [id]);
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async getItems(orderId) {
    const { rows } = await this.client.query(ITEMS_SQL, [orderId]);
    return rows.map(toItem);
  }

  // Cada parámetro se usa una sola vez y con un solo tipo: si se reutiliza el mismo
  // parámetro como VARCHAR y como TEXT, PostgreSQL rechaza la consulta
  // ("inconsistent types deduced for parameter").
  async updateStatus(id, status, userId) {
    await this.client.query(
      `UPDATE purchase_order
          SET status      = $2,
              approved_by = COALESCE($3, approved_by),
              received_at = CASE WHEN $4 THEN now() ELSE received_at END
        WHERE id = $1`,
      [id, status, status === 'APPROVED' ? userId : null, status === 'RECEIVED'],
    );
  }

  async insertHistory(orderId, fromStatus, toStatus, userId) {
    await this.client.query(
      'INSERT INTO order_status_history (order_id, from_status, to_status, changed_by) VALUES ($1, $2, $3, $4)',
      [orderId, fromStatus, toStatus, userId],
    );
  }

  async addOutboxEvent(eventType, payload) {
    await this.client.query(
      'INSERT INTO outbox_event (event_type, payload) VALUES ($1, $2::jsonb)',
      [eventType, JSON.stringify(payload)],
    );
  }
}

class PgOrderRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async withTransaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PgOrderTransaction(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Orden, ítems e historial inicial (null -> DRAFT) en una sola transacción.
  async create({ supplierId, destinationWarehouseId, totalAmount, createdBy, items }) {
    const id = await this.withTransaction(async (tx) => {
      const { rows } = await tx.client.query(
        `INSERT INTO purchase_order (supplier_id, destination_warehouse_id, total_amount, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [supplierId, destinationWarehouseId, totalAmount, createdBy],
      );
      const orderId = rows[0].id;
      for (const it of items) {
        await tx.client.query(
          `INSERT INTO purchase_order_item (order_id, product_id, sku_snapshot, quantity, unit_cost)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, it.productId, it.sku, it.quantity, it.unitCost],
        );
      }
      await tx.insertHistory(orderId, null, 'DRAFT', createdBy);
      return orderId;
    });
    return this.findById(id);
  }

  async findPage({ status, supplierId, limit, offset }) {
    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (supplierId) {
      params.push(supplierId);
      conditions.push(`supplier_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [page, count] = await Promise.all([
      this.pool.query(
        `${ORDER_SELECT} ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM purchase_order ${where}`, params),
    ]);
    return { items: page.rows.map(toOrder), total: count.rows[0].total };
  }

  async findById(id) {
    const { rows } = await this.pool.query(`${ORDER_SELECT} WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    const [items, history] = await Promise.all([
      this.pool.query(ITEMS_SQL, [id]),
      this.pool.query(
        `SELECT from_status, to_status, changed_by, changed_at
           FROM order_status_history WHERE order_id = $1 ORDER BY changed_at, id`,
        [id],
      ),
    ]);
    return {
      ...toOrder(rows[0]),
      items: items.rows.map(toItem),
      history: history.rows.map((h) => ({
        fromStatus: h.from_status, toStatus: h.to_status, changedBy: h.changed_by, changedAt: h.changed_at,
      })),
    };
  }
}

module.exports = { PgOrderRepository };
