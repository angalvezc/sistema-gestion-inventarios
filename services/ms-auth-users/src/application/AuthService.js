// Casos de uso de autenticación: login, refresh y validación de token (RF01, RNF07).
// Recibe sus dependencias (puertos) por constructor: no sabe si detrás hay
// PostgreSQL, bcrypt o JWT. Eso es lo que hace "hexagonal" a este servicio (RNF11).
const { ValidationError, UnauthorizedError } = require('../domain/errors');
const { normalizeEmail, toPublicUser } = require('../domain/user');

class AuthService {
  constructor({ userRepository, refreshTokenRepository, passwordHasher, tokenService }) {
    this.users = userRepository;
    this.refreshTokens = refreshTokenRepository;
    this.hasher = passwordHasher;
    this.tokens = tokenService;
  }

  async login({ email, password } = {}) {
    if (!email || !password) {
      throw new ValidationError('email y password son obligatorios');
    }
    const user = await this.users.findByEmail(normalizeEmail(email));
    const valid = user && user.active && (await this.hasher.compare(password, user.passwordHash));
    if (!valid) {
      // Mismo mensaje para usuario inexistente, inactivo o contraseña errada:
      // no le revelamos a un atacante cuál de las tres falló.
      throw new UnauthorizedError('Credenciales inválidas');
    }
    await this.users.updateLastLogin(user.id);
    user.lastLoginAt = new Date(); // refleja en la respuesta el login que se acaba de registrar
    return this.#issueTokens(user);
  }

  async refresh({ refreshToken } = {}) {
    if (!refreshToken) throw new ValidationError('refreshToken es obligatorio');

    const stored = await this.refreshTokens.findValidByHash(this.tokens.hashRefreshToken(refreshToken));
    if (!stored) throw new UnauthorizedError('Refresh token inválido o expirado');

    const user = await this.users.findById(stored.userId);
    if (!user || !user.active) throw new UnauthorizedError('Usuario inactivo');

    // Rotación: cada refresh token sirve una sola vez.
    await this.refreshTokens.revoke(stored.id);
    return this.#issueTokens(user);
  }

  // Usado por GET /auth/validate (endpoint interno, Entrega 2 §2.1).
  validate(accessToken) {
    if (!accessToken) throw new UnauthorizedError('Falta el token');
    try {
      return this.tokens.verifyAccessToken(accessToken);
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }
  }

  async #issueTokens(user) {
    const accessToken = this.tokens.signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refresh = this.tokens.generateRefreshToken();
    await this.refreshTokens.save({ userId: user.id, tokenHash: refresh.hash, expiresAt: refresh.expiresAt });
    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: this.tokens.accessTtl,
      user: toPublicUser(user),
    };
  }
}

module.exports = { AuthService };
