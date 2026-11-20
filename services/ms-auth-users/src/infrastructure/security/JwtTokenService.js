// Adaptador de tokens (RNF07): access token JWT firmado + refresh token opaco.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class JwtTokenService {
  constructor({ secret, accessTtl, refreshTtl }) {
    this.secret = secret;
    this.accessTtl = accessTtl;
    this.refreshTtl = refreshTtl;
  }

  // Claims acordados con el API Gateway: sub (id), email y role.
  signAccessToken({ sub, email, role }) {
    return jwt.sign({ email, role }, this.secret, {
      algorithm: 'HS256',
      subject: sub,
      expiresIn: this.accessTtl,
    });
  }

  verifyAccessToken(token) {
    const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    return { sub: payload.sub, email: payload.email, role: payload.role, exp: payload.exp };
  }

  // El refresh token es un valor aleatorio; en la BD solo queda su SHA-256.
  generateRefreshToken() {
    const token = crypto.randomBytes(48).toString('hex');
    return {
      token,
      hash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
    };
  }

  hashRefreshToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
  }
}

module.exports = { JwtTokenService };
