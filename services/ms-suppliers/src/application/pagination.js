// Convención común de paginación (Entrega 2, §2.2): ?page=0&size=20
const DEFAULT_SIZE = 20;
const MAX_SIZE = 100;

function parsePagination({ page, size } = {}) {
  const p = Number.parseInt(page, 10);
  const s = Number.parseInt(size, 10);
  return {
    page: Number.isInteger(p) && p >= 0 ? p : 0,
    size: Number.isInteger(s) && s > 0 ? Math.min(s, MAX_SIZE) : DEFAULT_SIZE,
  };
}

module.exports = { parsePagination };
