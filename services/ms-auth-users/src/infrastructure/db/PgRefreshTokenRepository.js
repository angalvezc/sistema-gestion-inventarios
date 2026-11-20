// Adaptador PostgreSQL para los refresh tokens (tabla refresh_token de db_auth).
class PgRefreshTokenRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async save({ userId, tokenHash, expiresAt }) {
    await this.pool.query(
      'INSERT INTO refresh_token (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt],
    );
  }

  // Solo devuelve el token si no está revocado ni vencido.
  async findValidByHash(tokenHash) {
    const { rows } = await this.pool.query(
      `SELECT id, user_id FROM refresh_token
       WHERE token_hash = $1 AND revoked = FALSE AND expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ? { id: rows[0].id, userId: rows[0].user_id } : null;
  }

  async revoke(id) {
    await this.pool.query('UPDATE refresh_token SET revoked = TRUE WHERE id = $1', [id]);
  }

  async revokeAllForUser(userId) {
    await this.pool.query('UPDATE refresh_token SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE', [userId]);
  }
}

module.exports = { PgRefreshTokenRepository };
