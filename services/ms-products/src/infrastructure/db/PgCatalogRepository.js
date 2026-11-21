// Adaptador PostgreSQL de db_products.
const { ConflictError } = require('../../domain/errors');

const PRODUCT_SELECT = `
  SELECT p.id, p.sku, p.barcode, p.name, p.description, p.category_id, c.name AS category_name,
         p.base_price, p.unit, p.active, p.created_at, p.updated_at
  FROM product p
  JOIN category c ON c.id = p.category_id`;

function toProduct(row, specs) {
  const product = {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name,
    basePrice: Number(row.base_price), // pg devuelve NUMERIC como texto
    unit: row.unit,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (specs) product.specs = specs;
  return product;
}

// 23505 = violación de UNIQUE. El nombre de la restricción dice qué campo se repitió;
// así también se cubren dos creaciones simultáneas con el mismo SKU.
function translateUniqueError(err) {
  if (err.code !== '23505') return err;
  if (err.constraint === 'uq_product_sku') return new ConflictError('Ya existe un producto con ese SKU', { field: 'sku' });
  if (err.constraint === 'uq_product_barcode') return new ConflictError('Ya existe un producto con ese código de barras', { field: 'barcode' });
  if (err.constraint === 'uq_category_name') return new ConflictError('Ya existe una categoría con ese nombre', { field: 'name' });
  return err;
}

// Escapa % y _ para que el texto buscado se tome literal en ILIKE.
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

class PgCatalogRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findProductPage({ sku, categoryId, q, active, limit, offset }) {
    const conditions = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (sku) add('p.sku = ?', sku);
    if (categoryId) add('p.category_id = ?', categoryId);
    if (active !== undefined) add('p.active = ?', active);
    if (q) {
      params.push(likePattern(q));
      const n = params.length;
      conditions.push(`(p.name ILIKE $${n} OR p.sku ILIKE $${n} OR p.barcode ILIKE $${n})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [page, count] = await Promise.all([
      this.pool.query(
        `${PRODUCT_SELECT} ${where} ORDER BY p.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.pool.query(`SELECT COUNT(*)::int AS total FROM product p ${where}`, params),
    ]);
    return { items: page.rows.map((r) => toProduct(r)), total: count.rows[0].total };
  }

  async findProductById(id) {
    const { rows } = await this.pool.query(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
    if (!rows[0]) return null;
    const specs = await this.pool.query(
      'SELECT spec_key AS key, spec_value AS value FROM product_spec WHERE product_id = $1 ORDER BY id',
      [id],
    );
    return toProduct(rows[0], specs.rows);
  }

  // Producto y especificaciones se guardan en una sola transacción.
  async createProduct(p) {
    const id = await this.#inTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO product (sku, barcode, name, description, category_id, base_price, unit, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE))
         RETURNING id`,
        [p.sku, p.barcode, p.name, p.description, p.categoryId, p.basePrice, p.unit, p.active],
      );
      await this.#insertSpecs(client, rows[0].id, p.specs);
      return rows[0].id;
    });
    return this.findProductById(id);
  }

  async updateProduct(id, p) {
    await this.#inTransaction(async (client) => {
      await client.query(
        `UPDATE product
            SET sku = $2, barcode = $3, name = $4, description = $5, category_id = $6,
                base_price = $7, unit = $8, active = COALESCE($9, active), updated_at = now()
          WHERE id = $1`,
        [id, p.sku, p.barcode, p.name, p.description, p.categoryId, p.basePrice, p.unit, p.active],
      );
      // Las especificaciones se reemplazan completas.
      await client.query('DELETE FROM product_spec WHERE product_id = $1', [id]);
      await this.#insertSpecs(client, id, p.specs);
    });
    return this.findProductById(id);
  }

  async deactivateProduct(id) {
    await this.pool.query('UPDATE product SET active = FALSE, updated_at = now() WHERE id = $1', [id]);
  }

  async listCategories() {
    const { rows } = await this.pool.query('SELECT id, name, description FROM category ORDER BY name');
    return rows;
  }

  async categoryExists(id) {
    const { rows } = await this.pool.query('SELECT 1 FROM category WHERE id = $1', [id]);
    return rows.length > 0;
  }

  async createCategory({ name, description }) {
    try {
      const { rows } = await this.pool.query(
        'INSERT INTO category (name, description) VALUES ($1, $2) RETURNING id, name, description',
        [name, description],
      );
      return rows[0];
    } catch (err) {
      throw translateUniqueError(err);
    }
  }

  async #insertSpecs(client, productId, specs) {
    for (const { key, value } of specs) {
      await client.query(
        'INSERT INTO product_spec (product_id, spec_key, spec_value) VALUES ($1, $2, $3)',
        [productId, key, value],
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

module.exports = { PgCatalogRepository };
