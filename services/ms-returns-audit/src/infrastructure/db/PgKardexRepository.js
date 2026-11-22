// Adaptador PostgreSQL del Kardex (tabla kardex_entry de db_audit).
// El servicio se conecta como audit_runtime: aquí solo hay SELECT e INSERT,
// y aunque hubiera un UPDATE o DELETE, PostgreSQL lo rechazaría (permisos + trigger).

// Candado de PostgreSQL que serializa las inserciones del Kardex: la cadena de
// hashes necesita que cada fila se calcule sobre la última realmente guardada.
const CHAIN_LOCK_ID = 810_106;

const ENTRY_SELECT = `
  SELECT id, event_id, product_id, sku_snapshot, warehouse_id, movement_type, quantity,
         balance_after, reference, user_id, user_email_snapshot, occurred_at, recorded_at, row_hash
  FROM kardex_entry`;

function toEntry(row) {
  return {
    id: Number(row.id), // BIGSERIAL llega como texto
    eventId: row.event_id,
    productId: row.product_id,
    skuSnapshot: row.sku_snapshot,
    warehouseId: row.warehouse_id,
    movementType: row.movement_type,
    quantity: row.quantity,
    balanceAfter: row.balance_after,
    reference: row.reference,
    userId: row.user_id,
    userEmail: row.user_email_snapshot,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    rowHash: row.row_hash,
  };
}

class PgKardexRepository {
  constructor(pool) {
    this.pool = pool;
  }

  // Ejecuta `work` con el candado de la cadena tomado; se libera solo al COMMIT/ROLLBACK.
  async withChainLock(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [CHAIN_LOCK_ID]);
      const tx = {
        exists: async (eventId) => {
          const { rows } = await client.query('SELECT 1 FROM kardex_entry WHERE event_id = $1', [eventId]);
          return rows.length > 0;
        },
        lastHash: async () => {
          const { rows } = await client.query('SELECT row_hash FROM kardex_entry ORDER BY id DESC LIMIT 1');
          return rows[0] ? rows[0].row_hash : null;
        },
        insert: async (e) => {
          await client.query(
            `INSERT INTO kardex_entry
               (event_id, product_id, sku_snapshot, warehouse_id, movement_type, quantity, balance_after,
                reference, user_id, user_email_snapshot, occurred_at, row_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [e.eventId, e.productId, e.skuSnapshot, e.warehouseId, e.movementType, e.quantity, e.balanceAfter,
              e.reference, e.userId, e.userEmail, e.occurredAt, e.rowHash],
          );
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

  async findPage({ productId, warehouseId, type, userId, from, to, limit, offset }) {
    const conditions = [];
    const params = [];
    const add = (sql, value) => {
      if (value === undefined) return;
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    add('product_id = ?', productId);
    add('warehouse_id = ?', warehouseId);
    add('movement_type = ?', type);
    add('user_id = ?', userId);
    add('occurred_at >= ?', from);
    add('occurred_at < ?', to);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [page, count] = await Promise.all([
      this.pool.query(`${ENTRY_SELECT} ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM kardex_entry ${where}`, params),
    ]);
    return { items: page.rows.map(toEntry), total: count.rows[0].total };
  }

  async findById(id) {
    const { rows } = await this.pool.query(`${ENTRY_SELECT} WHERE id = $1`, [id]);
    return rows[0] ? toEntry(rows[0]) : null;
  }

  // Para verificar la cadena: filas en orden, por lotes.
  async findChainBatch(afterId, limit) {
    const { rows } = await this.pool.query(`${ENTRY_SELECT} WHERE id > $1 ORDER BY id LIMIT $2`, [afterId, limit]);
    return rows.map(toEntry);
  }

  // Saldo actual: el último balance_after de cada producto en cada bodega.
  async latestBalances() {
    const { rows } = await this.pool.query(
      `SELECT DISTINCT ON (product_id, warehouse_id) product_id, warehouse_id, balance_after
         FROM kardex_entry
        ORDER BY product_id, warehouse_id, id DESC`,
    );
    return rows.map((r) => ({ productId: r.product_id, warehouseId: r.warehouse_id, balance: r.balance_after }));
  }

  // Movimientos desde la medianoche en la zona horaria indicada (America/Bogota).
  async countMovementsToday(timezone) {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*)::int AS total
         FROM kardex_entry
        WHERE occurred_at >= (date_trunc('day', now() AT TIME ZONE $1::text) AT TIME ZONE $1::text)`,
      [timezone],
    );
    return rows[0].total;
  }
}

module.exports = { PgKardexRepository };
