// Adaptador PostgreSQL de db_suppliers.
const { ConflictError } = require('../../domain/errors');

const SUPPLIER_SELECT = `
  SELECT id, nit, business_name, email, phone, address, payment_terms,
         lead_time_days, active, created_at
  FROM supplier`;

function toSupplier(row, contacts) {
  const supplier = {
    id: row.id,
    nit: row.nit,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    paymentTerms: row.payment_terms,
    leadTimeDays: row.lead_time_days,
    active: row.active,
    createdAt: row.created_at,
  };
  if (contacts) supplier.contacts = contacts;
  return supplier;
}

// 23505 = violación de UNIQUE: también cubre dos altas simultáneas con el mismo NIT.
function translateUniqueError(err) {
  if (err.code === '23505' && err.constraint === 'uq_supplier_nit') {
    return new ConflictError('Ya existe un proveedor con ese NIT', { field: 'nit' });
  }
  return err;
}

const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

class PgSupplierRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findPage({ q, active, limit, offset }) {
    const conditions = [];
    const params = [];
    if (active !== undefined) {
      params.push(active);
      conditions.push(`active = $${params.length}`);
    }
    if (q) {
      params.push(likePattern(q));
      conditions.push(`(business_name ILIKE $${params.length} OR nit ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [page, count] = await Promise.all([
      this.pool.query(
        `${SUPPLIER_SELECT} ${where} ORDER BY business_name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM supplier ${where}`, params),
    ]);
    return { items: page.rows.map((r) => toSupplier(r)), total: count.rows[0].total };
  }

  async findById(id) {
    const { rows } = await this.pool.query(`${SUPPLIER_SELECT} WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    const contacts = await this.pool.query(
      'SELECT id, name, role, email, phone FROM supplier_contact WHERE supplier_id = $1 ORDER BY id',
      [id],
    );
    return toSupplier(rows[0], contacts.rows);
  }

  // Proveedor y contactos se guardan en una sola transacción.
  async create(s) {
    const id = await this.#inTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO supplier (nit, business_name, email, phone, address, payment_terms, lead_time_days, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE))
         RETURNING id`,
        [s.nit, s.businessName, s.email, s.phone, s.address, s.paymentTerms, s.leadTimeDays, s.active],
      );
      await this.#insertContacts(client, rows[0].id, s.contacts);
      return rows[0].id;
    });
    return this.findById(id);
  }

  async update(id, s) {
    await this.#inTransaction(async (client) => {
      await client.query(
        `UPDATE supplier
            SET nit = $2, business_name = $3, email = $4, phone = $5, address = $6,
                payment_terms = $7, lead_time_days = $8, active = COALESCE($9, active)
          WHERE id = $1`,
        [id, s.nit, s.businessName, s.email, s.phone, s.address, s.paymentTerms, s.leadTimeDays, s.active],
      );
      // Los contactos se reemplazan completos.
      await client.query('DELETE FROM supplier_contact WHERE supplier_id = $1', [id]);
      await this.#insertContacts(client, id, s.contacts);
    });
    return this.findById(id);
  }

  async deactivate(id) {
    await this.pool.query('UPDATE supplier SET active = FALSE WHERE id = $1', [id]);
  }

  async #insertContacts(client, supplierId, contacts) {
    for (const c of contacts) {
      await client.query(
        'INSERT INTO supplier_contact (supplier_id, name, role, email, phone) VALUES ($1, $2, $3, $4, $5)',
        [supplierId, c.name, c.role, c.email, c.phone],
      );
    }
  }

  async #inTransaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw translateUniqueError(err);
    } finally {
      client.release();
    }
  }
}

module.exports = { PgSupplierRepository };
