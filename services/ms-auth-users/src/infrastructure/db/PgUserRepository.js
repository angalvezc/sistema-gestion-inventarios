// Adaptador PostgreSQL del repositorio de usuarios.
// Traduce entre filas snake_case de db_auth y objetos camelCase del dominio.
const { ConflictError, ValidationError } = require('../../domain/errors');

const SELECT_USER = `
  SELECT u.id, u.email, u.password_hash, u.full_name, u.role_id, r.name AS role,
         u.active, u.created_at, u.last_login_at
  FROM users u
  JOIN role r ON r.id = u.role_id`;

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    roleId: row.role_id,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

// Columnas que se pueden actualizar (lista blanca: evita inyección por nombres de campo).
const UPDATABLE = {
  fullName: 'full_name',
  roleId: 'role_id',
  active: 'active',
  passwordHash: 'password_hash',
};

class PgUserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async findByEmail(email) {
    const { rows } = await this.pool.query(`${SELECT_USER} WHERE u.email = $1`, [email]);
    return toUser(rows[0]);
  }

  async findById(id) {
    const { rows } = await this.pool.query(`${SELECT_USER} WHERE u.id = $1`, [id]);
    return toUser(rows[0]);
  }

  async findPage({ limit, offset }) {
    const [page, count] = await Promise.all([
      this.pool.query(`${SELECT_USER} ORDER BY u.created_at LIMIT $1 OFFSET $2`, [limit, offset]),
      this.pool.query('SELECT COUNT(*)::int AS total FROM users'),
    ]);
    return { items: page.rows.map(toUser), total: count.rows[0].total };
  }

  async count() {
    const { rows } = await this.pool.query('SELECT COUNT(*)::int AS total FROM users');
    return rows[0].total;
  }

  async findRoleIdByName(name) {
    const { rows } = await this.pool.query('SELECT id FROM role WHERE name = $1', [name]);
    if (!rows[0]) throw new ValidationError(`Rol desconocido: ${name}`);
    return rows[0].id;
  }

  async create({ email, passwordHash, fullName, roleId }) {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO users (email, password_hash, full_name, role_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, passwordHash, fullName, roleId],
      );
      return this.findById(rows[0].id);
    } catch (err) {
      // 23505 = violación de UNIQUE (dos creaciones simultáneas con el mismo email).
      if (err.code === '23505') throw new ConflictError('Ya existe un usuario con ese email');
      throw err;
    }
  }

  async update(id, patch) {
    const entries = Object.entries(patch).filter(([key]) => key in UPDATABLE);
    if (entries.length > 0) {
      const sets = entries.map(([key], i) => `${UPDATABLE[key]} = $${i + 2}`);
      await this.pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, [
        id,
        ...entries.map(([, value]) => value),
      ]);
    }
    return this.findById(id);
  }

  async updateLastLogin(id) {
    await this.pool.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
  }
}

module.exports = { PgUserRepository };
