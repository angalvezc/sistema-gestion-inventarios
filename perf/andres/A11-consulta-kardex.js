// A11 - Consulta del Kardex con filtros GET /audit/kardex (RF07).
// 50 usuarios consultan el Kardex con los filtros de la Entrega 2: producto, bodega,
// tipo de movimiento y fecha. Criterio: p95 < 2 s.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, BOD_A, BOD_B, login, runId, seedCatalog, addStock, movement, pick, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 50, duration: '2m', p95: 2000 });

export function setup() {
  const { accessToken } = login();
  const products = seedCatalog(accessToken, runId(), 10);
  // Algunos movimientos por producto para que el Kardex tenga qué mostrar.
  products.forEach((id) => {
    addStock(accessToken, id, BOD_A, 50);
    addStock(accessToken, id, BOD_B, 50);
    movement(accessToken, id, BOD_A, 'EXIT', 5, 'PERF-A11', 'setup');
  });
  sleep(3); // tiempo para que los eventos lleguen al Kardex
  const today = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); // hoy en Colombia
  return { token: accessToken, products, today };
}

export default function (data) {
  const filters = [
    `productId=${pick(data.products)}`,
    `warehouseId=${Math.random() < 0.5 ? BOD_A : BOD_B}&size=20`,
    'type=EXIT&size=20',
    `from=${data.today}&to=${data.today}&size=20`,
  ];
  const res = http.get(`${API}/audit/kardex?${pick(filters)}`, params(data.token, 'main'));
  check(res, { 'responde 200 con registros': (r) => r.status === 200 && Array.isArray(r.json('content')) });
  sleep(1);
}

export const handleSummary = summary('A11', 'Consulta del Kardex con filtros (50 VUs, 2 min)');
