// A04 - Detalle de producto con especificaciones GET /products/{id} (RF02).
// Es la consulta que también usan ms-purchases y ms-returns-audit por REST.
// 100 usuarios durante 1 minuto. Criterio: p95 < 500 ms.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, runId, seedCatalog, pick, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 100, duration: '1m', p95: 500 });

export function setup() {
  const { accessToken } = login();
  return { token: accessToken, products: seedCatalog(accessToken, runId(), 50) };
}

export default function (data) {
  const res = http.get(`${API}/products/${pick(data.products)}`, params(data.token, 'main'));
  check(res, { 'devuelve el producto con sus especificaciones': (r) => r.status === 200 && r.json('specs').length === 1 });
  sleep(1);
}

export const handleSummary = summary('A04', 'Detalle de producto GET /products/{id} (100 VUs, 1 min)');
