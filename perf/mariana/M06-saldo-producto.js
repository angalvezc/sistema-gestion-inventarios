// M06 - Saldo de un producto en ambas bodegas GET /stock/{productId} (RF03, RNF06).
// Es la consulta típica del operario antes de despachar. 100 usuarios, 2 minutos.
// Criterio: p95 < 2 s.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, seedProducts, pick, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 100, duration: '2m', p95: 2000 });

export function setup() {
  const { accessToken } = login();
  return { token: accessToken, products: seedProducts(accessToken, 50, 100) };
}

export default function (data) {
  const res = http.get(`${API}/stock/${pick(data.products)}`, params(data.token, 'main'));
  check(res, { 'devuelve las 2 bodegas': (r) => r.status === 200 && r.json('warehouses').length === 2 });
  sleep(1);
}

export const handleSummary = summary('M06', 'Saldo por producto GET /stock/{id} (100 VUs, 2 min)');
