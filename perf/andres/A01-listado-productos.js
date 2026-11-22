// A01 - Listado paginado del catálogo GET /products (RF02, RNF06).
// 50 usuarios recorren páginas del catálogo durante 2 minutos.
// Criterio: p95 < 1 s y menos de 1 % de errores.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, runId, seedCatalog, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 50, duration: '2m', p95: 1000 });

export function setup() {
  const { accessToken } = login();
  seedCatalog(accessToken, runId(), 50);
  return { token: accessToken };
}

export default function (data) {
  const page = Math.floor(Math.random() * 3);
  const res = http.get(`${API}/products?page=${page}&size=20`, params(data.token, 'main'));
  check(res, { 'responde 200 con content': (r) => r.status === 200 && Array.isArray(r.json('content')) });
  sleep(1);
}

export const handleSummary = summary('A01', 'Listado de productos GET /products (50 VUs, 2 min)');
