// A02 - Búsqueda de productos por texto GET /products?q= (RF02).
// La búsqueda recorre nombre, SKU y código de barras con ILIKE: es más costosa
// que el listado. 50 usuarios durante 2 minutos.
// Criterio: p95 < 1.5 s y que la búsqueda encuentre el producto.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, runId, seedCatalog, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 50, duration: '2m', p95: 1500 });

export function setup() {
  const { accessToken } = login();
  const run = runId();
  seedCatalog(accessToken, run, 50);
  return { token: accessToken, run };
}

export default function (data) {
  // Alterna búsquedas por SKU, por nombre y por código de barras.
  const n = Math.floor(Math.random() * 50);
  const terms = [`PERF-${data.run}-${n}`, `prueba ${data.run}-${n}`, `77${data.run}`];
  const q = encodeURIComponent(terms[Math.floor(Math.random() * terms.length)]);
  const res = http.get(`${API}/products?q=${q}`, params(data.token, 'main'));
  check(res, { 'encuentra resultados': (r) => r.status === 200 && r.json('totalElements') > 0 });
  sleep(1);
}

export const handleSummary = summary('A02', 'Búsqueda de productos GET /products?q= (50 VUs, 2 min)');
