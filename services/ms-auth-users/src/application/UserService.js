// Casos de uso de gestión de usuarios (RF01). Solo ADMIN llega aquí:
// el API Gateway aplica el control de acceso por rol antes de enrutar (RNF05).
const { ConflictError, NotFoundError } = require('../domain/errors');
const {
  ROLES,
  normalizeEmail,
  assertValidId,
  assertValidNewUser,
  assertValidUpdate,
  toPublicUser,
} = require('../domain/user');
const { parsePagination } = require('./pagination');

class UserService {
  constructor({ userRepository, refreshTokenRepository, passwordHasher }) {
    this.users = userRepository;
    this.refreshTokens = refreshTokenRepository;
    this.hasher = passwordHasher;
  }

  async list(query) {
    const { page, size } = parsePagination(query);
    const { items, total } = await this.users.findPage({ limit: size, offset: page * size });
    return { content: items.map(toPublicUser), page, size, totalElements: total };
  }

  async create(input = {}) {
    assertValidNewUser(input);
    const email = normalizeEmail(input.email);
    if (await this.users.findByEmail(email)) {
      throw new ConflictError('Ya existe un usuario con ese email');
    }
    const user = await this.users.create({
      email,
      passwordHash: await this.hasher.hash(input.password),
      fullName: input.fullName.trim(),
      roleId: await this.users.findRoleIdByName(input.role),
    });
    return toPublicUser(user);
  }

  async update(id, changes = {}) {
    assertValidId(id);
    assertValidUpdate(changes);
    await this.#getExisting(id);

    const patch = {};
    if ('fullName' in changes) patch.fullName = changes.fullName.trim();
    if ('role' in changes) patch.roleId = await this.users.findRoleIdByName(changes.role);
    if ('active' in changes) patch.active = changes.active;
    if ('password' in changes) patch.passwordHash = await this.hasher.hash(changes.password);

    const updated = await this.users.update(id, patch);
    // Si se desactiva o se cambia la contraseña, sus sesiones abiertas dejan de servir.
    if (changes.active === false || 'password' in changes) {
      await this.refreshTokens.revokeAllForUser(id);
    }
    return toPublicUser(updated);
  }

  // DELETE = baja lógica (el usuario sigue existiendo para la trazabilidad del Kardex).
  async deactivate(id) {
    assertValidId(id);
    await this.#getExisting(id);
    await this.users.update(id, { active: false });
    await this.refreshTokens.revokeAllForUser(id);
  }

  // Crea el primer ADMIN si la base está vacía; sin él nadie podría iniciar sesión.
  async ensureInitialAdmin({ email, password, fullName }) {
    if ((await this.users.count()) > 0) return null;
    if (!email || !password) {
      console.warn('[ms-auth-users] No hay usuarios y faltan ADMIN_EMAIL/ADMIN_PASSWORD: no se creó el administrador inicial');
      return null;
    }
    const admin = await this.create({ email, password, fullName, role: ROLES.ADMIN });
    console.log(`[ms-auth-users] Administrador inicial creado: ${admin.email}`);
    return admin;
  }

  async #getExisting(id) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return user;
  }
}

module.exports = { UserService };
