// Adaptador PostgreSQL de db_stock.
//  - PgStockRepository: lecturas y apertura de transacciones.
//  - PgStockTransaction: operaciones que deben ocurrir juntas dentro de una transacción.

const LEVEL_SELECT = `
  SELECT s.id, s.product_id, s.warehouse_id, w.code AS warehouse_code,
         s.quantity, s.min_threshold, s.updated_at
  FROM stock_level s
  JOIN warehouse w ON w.id = s.warehouse_id`;

function toLevel(row) {
  return {
    id: row.id,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouse_code,
    quantity: row.quantity,
    minThreshold: row.min_threshold,
    updatedAt: row.updated_at,
  };
}

function toMovement(row) {
  return {
    id: row.id,
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    type: row.type,
    quantity: row.quantity,
    balanceAfter: row.balance_after,
    transferId: row.transfer_id,
    reference: row.reference,
    userId: row.user_id,
    createdAt: row.created_at,
  };
}

class PgStockTransaction {
  constructor(client) {
    this.client = client;
  }

  // Suma unidades. Si el producto nunca había estado en esa bodega, crea su fila (upsert).
  async increase(productId, warehouseId, quantity) {
    const { rows } = await this.client.query(
      `INSERT INTO stock_level (product_id, warehouse_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, warehouse_id) DO UPDATE
         SET quantity   = stock_level.quantity + EXCLUDED.quantity,
             version    = stock_level.version + 1,
             updated_at = now()
       RETURNING quantity, min_threshold`,
      [productId, warehouseId, quantity],
    );
    return { quantity: rows[0].quantity, minThreshold: rows[0].min_threshold };
  }

  // Resta unidades SOLO si alcanzan. Verificar y restar es una única instrucción:
  // PostgreSQL bloquea la fila, así que dos salidas simultáneas no pueden
  // leer el mismo saldo y dejarlo negativo (RF04). Devuelve null si no alcanza.
  async decrease(productId, warehouseId, quantity) {
    const { rows } = await this.client.query(
      `UPDATE stock_level
          SET quantity   = quantity - $3,
              version    = version + 1,
              updated_at = now()
        WHERE product_id = $1 AND warehouse_id = $2 AND quantity >= $3
        RETURNING quantity, min_threshold`,
      [productId, warehouseId, quantity],
    );
    return rows[0] ? { quantity: rows[0].quantity, minThreshold: rows[0].min_threshold } : null;
  }

  async getQuantity(productId, warehouseId) {
    const { rows } = await this.client.query(
      'SELECT quantity FROM stock_level WHERE product_id = $1 AND warehouse_id = $2',
      [productId, warehouseId],
    );
    return rows[0] ? rows[0].quantity : 0;
  }

  async insertMovement({ productId, warehouseId, type, quantity, balanceAfter, transferId, reference, userId }) {
    const { rows } = await this.client.query(
      `INSERT INTO stock_movement
         (product_id, warehouse_id, type, quantity, balance_after, transfer_id, reference, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [productId, warehouseId, type, quantity, balanceAfter, transferId, reference, userId],
    );
    return toMovement(rows[0]);
  }

  async insertTransfer({ fromWarehouseId, toWarehouseId, userId }) {
    const { rows } = await this.client.query(
      `INSERT INTO stock_transfer (from_warehouse_id, to_warehouse_id, user_id)
       VALUES ($1, $2, $3)
       RETURNING id, status, created_at`,
      [fromWarehouseId, toWarehouseId, userId],
    );
    return { id: rows[0].id, status: rows[0].status, createdAt: rows[0].created_at };
  }

  // Devuelve true si es la primera vez que se ve este evento; false si ya se procesó.
  async markEventProcessed(eventId, eventType) {
    const { rows } = await this.client.query(
      `INSERT INTO processed_event (event_id, event_type) VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType],
    );
    return rows.length > 0;
  }

  async addOutboxEvent(eventType, payload) {
    await this.client.query(
      'INSERT INTO outbox_event (event_type, payload) VALUES ($1, $2::jsonb)',
      [eventType, JSON.stringify(payload)],
    );
  }
}

class PgStockRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // Unidad de trabajo: COMMIT si el callback termina bien, ROLLBACK si lanza un error.
  async withTransaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(new PgStockTransaction(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findPage({ warehouseId, productId, limit, offset }) {
    const conditions = [];
    const params = [];
    if (warehouseId) {
      params.push(warehouseId);
      conditions.push(`s.warehouse_id = $${params.length}`);
    }
    if (productId) {
      params.push(productId);
      conditions.push(`s.product_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [page, count] = await Promise.all([
      this.pool.query(
        `${LEVEL_SELECT} ${where} ORDER BY s.product_id, s.warehouse_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM stock_level s ${where}`, params),
    ]);
    return { items: page.rows.map(toLevel), total: count.rows[0].total };
  }

  async findByProduct(productId) {
    const { rows } = await this.pool.query(`${LEVEL_SELECT} WHERE s.product_id = $1`, [productId]);
    return rows.map(toLevel);
  }

  async findAlerts({ warehouseId }) {
    const params = [];
    let filter = '';
    if (warehouseId) {
      params.push(warehouseId);
      filter = 'AND s.warehouse_id = $1';
    }
    const { rows } = await this.pool.query(
      `${LEVEL_SELECT}
       WHERE (s.quantity = 0 OR s.quantity < s.min_threshold) ${filter}
       ORDER BY s.quantity ASC, s.product_id`,
      params,
    );
    return rows.map(toLevel);
  }

  async upsertMinThreshold(productId, warehouseId, minThreshold) {
    const { rows } = await this.pool.query(
      `INSERT INTO stock_level (product_id, warehouse_id, quantity, min_threshold)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (product_id, warehouse_id) DO UPDATE
         SET min_threshold = EXCLUDED.min_threshold,
             version       = stock_level.version + 1,
             updated_at    = now()
       RETURNING id`,
      [productId, warehouseId, minThreshold],
    );
    const result = await this.pool.query(`${LEVEL_SELECT} WHERE s.id = $1`, [rows[0].id]);
    return toLevel(result.rows[0]);
  }

  async findWarehouse(id) {
    const { rows } = await this.pool.query('SELECT id, code, name, city FROM warehouse WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async listWarehouses() {
    const { rows } = await this.pool.query('SELECT id, code, name, city FROM warehouse ORDER BY id');
    return rows;
  }
}

module.exports = { PgStockRepository };
