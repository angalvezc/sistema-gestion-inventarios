// Casos de uso del catálogo (RF02): productos y categorías.
// Los permisos (ADMIN para escribir) los aplica el API Gateway.
const { NotFoundError, ValidationError } = require('../domain/errors');
const { normalizeSku, assertUuid, validateProduct, validateCategory } = require('../domain/product');
const { parsePagination } = require('./pagination');

class CatalogService {
  constructor({ catalogRepository }) {
    this.repo = catalogRepository;
  }

  // ---------------- Productos ----------------

  // Filtros de la Entrega 2 (§2.1): sku, categoryId, q. Por defecto solo activos.
  async listProducts(query = {}) {
    const { page, size } = parsePagination(query);
    const filters = {
      sku: query.sku ? normalizeSku(query.sku) : undefined,
      categoryId: this.#optionalId(query.categoryId),
      q: query.q ? String(query.q).trim().slice(0, 100) : undefined,
      active: query.active === 'false' ? false : query.active === 'all' ? undefined : true,
    };
    const { items, total } = await this.repo.findProductPage({ ...filters, limit: size, offset: page * size });
    return { content: items, page, size, totalElements: total };
  }

  // Devuelve también productos inactivos: compras o Kardex antiguos pueden referirlos.
  async getProduct(id) {
    assertUuid(id);
    const product = await this.repo.findProductById(id);
    if (!product) throw new NotFoundError('Producto no encontrado');
    return product;
  }

  async createProduct(input) {
    const data = validateProduct(input);
    await this.#assertCategoryExists(data.categoryId);
    return this.repo.createProduct(data);
  }

  // Reemplazo completo (PUT), incluidas las especificaciones.
  async updateProduct(id, input) {
    assertUuid(id);
    const data = validateProduct(input);
    await this.getProduct(id);
    await this.#assertCategoryExists(data.categoryId);
    return this.repo.updateProduct(id, data);
  }

  // DELETE = baja lógica: el producto sigue existiendo para la trazabilidad.
  async deactivateProduct(id) {
    await this.getProduct(id);
    await this.repo.deactivateProduct(id);
  }

  // ---------------- Categorías ----------------

  listCategories() {
    return this.repo.listCategories();
  }

  createCategory(input) {
    return this.repo.createCategory(validateCategory(input));
  }

  // ---------------- Internos ----------------

  async #assertCategoryExists(categoryId) {
    if (!(await this.repo.categoryExists(categoryId))) {
      throw new ValidationError('Datos del producto inválidos', [`categoryId: la categoría ${categoryId} no existe`]);
    }
  }

  #optionalId(value) {
    if (value === undefined || value === '') return undefined;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('categoryId debe ser un entero positivo');
    return id;
  }
}

module.exports = { CatalogService };
