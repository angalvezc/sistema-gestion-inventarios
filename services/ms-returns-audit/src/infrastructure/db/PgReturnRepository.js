// Adaptador PostgreSQL de devoluciones (return_request, return_item, outbox_event).

function toReturn(row, items) {
  return {
    id: row.id,
    returnNumber: row.return_number,
    origin: row.origin,
    reason: row.reason,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    items: items.map((i) => ({
      id: i.id, productId: i.product_id, quantity: i.quantity, disposition: i.disposition, warehouseId: i.warehouse_id,
    })),
  };
}

const RETURN_SELECT = 'SELECT id, return_number, origin, reason, status, created_by, created_at FROM return_request';
const ITEMS_SQL = 'SELECT id, return_id, product_id, quantity, disposition, warehouse_id FROM return_item WHERE return_id = ANY($1::uuid[]) ORDER BY id';

class PgReturnRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async withTransaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        // Se registra ya PROCESSED: en la misma transacción queda el evento que
        // hace que ms-inventory-stock aplique la devolución.
        insertReturn: async ({ origin, reason, createdBy }) => {
          const { rows } = await client.query(
            `INSERT INTO return_request (origin, reason, status, created_by)
             VALUES ($1, $2, 'PROCESSED', $3)
             RETURNING id, return_number`,
            [origin, reason, createdBy],
          );
          return { id: rows[0].id, returnNumber: rows[0].return_number };
        },
        insertItem: async (returnId, it) => {
          await client.query(
            'INSERT INTO return_item (return_id, product_id, quantity, disposition, warehouse_id) VALUES ($1, $2, $3, $4, $5)',
            [returnId, it.productId, it.quantity, it.disposition, it.warehouseId],
          );
        },
        addOutboxEvent: async (eventType, payload) => {
          await client.query('INSERT INTO outbox_event (event_type, payload) VALUES ($1, $2::jsonb)',
            [eventType, JSON.stringify(payload)]);
        },
      };
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async #withItems(rows) {
    if (rows.length === 0) return [];
    const items = await this.pool.query(ITEMS_SQL, [rows.map((r) => r.id)]);
    return rows.map((r) => toReturn(r, items.rows.filter((i) => i.return_id === r.id)));
  }

  async findPage({ origin, limit, offset }) {
    const params = origin ? [origin] : [];
    const where = origin ? 'WHERE origin = $1' : '';
    const [page, count] = await Promise.all([
      this.pool.query(`${RETURN_SELECT} ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM return_request ${where}`, params),
    ]);
    return { items: await this.#withItems(page.rows), total: count.rows[0].total };
  }

  async findById(id) {
    const { rows } = await this.pool.query(`${RETURN_SELECT} WHERE id = $1`, [id]);
    const [ret] = await this.#withItems(rows);
    return ret || null;
  }
}

module.exports = { PgReturnRepository };
