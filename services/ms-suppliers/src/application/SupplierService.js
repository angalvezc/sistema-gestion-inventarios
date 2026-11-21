// Casos de uso del directorio de proveedores (RF08).
// Los permisos (ADMIN para escribir) los aplica el API Gateway.
const { NotFoundError } = require('../domain/errors');
const { assertUuid, validateSupplier } = require('../domain/supplier');
const { parsePagination } = require('./pagination');

class SupplierService {
  constructor({ supplierRepository }) {
    this.repo = supplierRepository;
  }

  // Filtro q por razón social o NIT. Por defecto solo activos.
  async list(query = {}) {
    const { page, size } = parsePagination(query);
    const filters = {
      q: query.q ? String(query.q).trim().slice(0, 100) : undefined,
      active: query.active === 'false' ? false : query.active === 'all' ? undefined : true,
    };
    const { items, total } = await this.repo.findPage({ ...filters, limit: size, offset: page * size });
    return { content: items, page, size, totalElements: total };
  }

  // Devuelve también proveedores inactivos: órdenes de compra antiguas los referencian.
  async get(id) {
    assertUuid(id);
    const supplier = await this.repo.findById(id);
    if (!supplier) throw new NotFoundError('Proveedor no encontrado');
    return supplier;
  }

  create(input) {
    return this.repo.create(validateSupplier(input));
  }

  // Reemplazo completo (PUT), incluidos los contactos.
  async update(id, input) {
    assertUuid(id);
    const data = validateSupplier(input);
    await this.get(id);
    return this.repo.update(id, data);
  }

  // DELETE = baja lógica.
  async deactivate(id) {
    await this.get(id);
    await this.repo.deactivate(id);
  }
}

module.exports = { SupplierService };
