// Casos de uso del Kardex inalterable (RF07, RNF12).
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../domain/errors');
const { MOVEMENT_TYPES, GENESIS_HASH, isUuid, toKardexEntry, computeRowHash } = require('../domain/kardex');
const { parsePagination } = require('./pagination');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const COLOMBIA_OFFSET = '-05:00'; // Colombia no tiene horario de verano: el desfase es fijo

// Convierte "2026-11-20" (día en hora de Colombia) o una fecha ISO completa en Date.
// endOfDay = true -> el límite superior es el inicio del día SIGUIENTE (exclusivo).
function parseDate(value, field, endOfDay = false) {
  if (value === undefined || value === '') return undefined;
  let date;
  if (DATE_ONLY.test(value)) {
    date = new Date(`${value}T00:00:00${COLOMBIA_OFFSET}`);
    if (endOfDay) date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field}: fecha inválida (use AAAA-MM-DD o ISO 8601)`);
  return date;
}

class KardexService {
  constructor({ kardexRepository, productCatalog }) {
    this.repo = kardexRepository;
    this.catalog = productCatalog;
  }

  // Consumidor de stock.movement.created: agrega UNA fila al final de la cadena.
  async recordMovement(event) {
    const entry = toKardexEntry(event);
    if (!entry.skuSnapshot) entry.skuSnapshot = await this.#lookupSku(entry.productId);

    // withChainLock serializa las inserciones: la fila anterior no cambia mientras
    // se calcula el hash de la nueva, aunque haya mensajes en paralelo o 2 réplicas.
    const inserted = await this.repo.withChainLock(async (tx) => {
      if (await tx.exists(entry.eventId)) return false; // evento repetido: idempotencia
      const previousHash = (await tx.lastHash()) || GENESIS_HASH;
      await tx.insert({ ...entry, rowHash: computeRowHash(previousHash, entry) });
      return true;
    });
    return { duplicate: !inserted, movements: inserted ? 1 : 0 };
  }

  // Filtros de la Entrega 2 (§2.1): producto, bodega, fechas, tipo y usuario.
  async list(query = {}) {
    const { page, size } = parsePagination(query);
    const filters = {
      productId: this.#optionalUuid(query.productId, 'productId'),
      userId: this.#optionalUuid(query.userId, 'userId'),
      warehouseId: this.#optionalId(query.warehouseId),
      type: this.#optionalType(query.type),
      from: parseDate(query.from, 'from'),
      to: parseDate(query.to, 'to', true),
    };
    const { items, total } = await this.repo.findPage({ ...filters, limit: size, offset: page * size });
    return { content: items, page, size, totalElements: total };
  }

  async get(id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw new ValidationError('id debe ser un entero positivo');
    const entry = await this.repo.findById(n);
    if (!entry) throw new NotFoundError('Registro de Kardex no encontrado');
    return entry;
  }

  // RNF12: recorre la cadena desde la primera fila y recalcula cada hash.
  // Si una fila fue alterada en la base, su hash recalculado no coincide.
  async verify() {
    let previousHash = GENESIS_HASH;
    let checked = 0;
    let afterId = 0;
    for (;;) {
      const batch = await this.repo.findChainBatch(afterId, 1000);
      if (batch.length === 0) break;
      for (const row of batch) {
        if (computeRowHash(previousHash, row) !== row.rowHash) {
          return {
            valid: false,
            checkedEntries: checked,
            firstInvalidEntryId: row.id,
            message: `La cadena se rompe en el registro ${row.id}: sus datos o los de un registro anterior fueron alterados`,
            checkedAt: new Date().toISOString(),
          };
        }
        previousHash = row.rowHash;
        checked += 1;
        afterId = row.id;
      }
    }
    return {
      valid: true,
      checkedEntries: checked,
      lastHash: previousHash,
      message: checked === 0 ? 'El Kardex está vacío' : 'Kardex íntegro: ningún registro fue alterado',
      checkedAt: new Date().toISOString(),
    };
  }

  // El SKU viene de ms-products. Si no responde, la fila se guarda igual sin SKU:
  // el Kardex nunca se detiene por otro servicio (RNF09).
  async #lookupSku(productId) {
    try {
      const product = await this.catalog.getProduct(productId);
      return product ? product.sku : null;
    } catch (err) {
      if (!(err instanceof ServiceUnavailableError)) throw err;
      console.warn(`[kardex] ms-products no disponible: el movimiento de ${productId} se guarda sin SKU`);
      return null;
    }
  }

  #optionalUuid(value, field) {
    if (value === undefined || value === '') return undefined;
    if (!isUuid(value)) throw new ValidationError(`${field} debe ser un UUID válido`);
    return value;
  }

  #optionalId(value) {
    if (value === undefined || value === '') return undefined;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError('warehouseId debe ser un entero positivo');
    return id;
  }

  #optionalType(value) {
    if (value === undefined || value === '') return undefined;
    if (!MOVEMENT_TYPES.includes(value)) throw new ValidationError(`type debe ser uno de ${MOVEMENT_TYPES.join(', ')}`);
    return value;
  }
}

module.exports = { KardexService };
