// M04 - Sobrecosto del API Gateway (RNF05, RNF06).
// La misma consulta (GET /stock) se mide dos veces con la misma carga:
//   1) directo a ms-inventory-stock (solo posible desde la red interna de Docker)
//   2) a través del API Gateway (JWT + roles + rate limiting + proxy)
// La diferencia de p95 es lo que "cuesta" pasar por el gateway.
// Criterio: diferencia de p95 < 50 ms.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, STOCK_DIRECT, login, seedProducts, params, buildOptions, summary, p95Of } from './lib/common.js';

const MAX_DIFF_MS = 50;

export const options = buildOptions({
  scenarios: {
    directo: { executor: 'constant-vus', exec: 'direct', vus: 20, duration: '1m' },
    gateway: { executor: 'constant-vus', exec: 'viaGateway', vus: 20, duration: '1m', startTime: '1m5s' },
  },
  p95: 2000,
  thresholds: { 'http_req_duration{name:directo}': ['p(95)>=0'] },
});

export function setup() {
  const { accessToken } = login();
  seedProducts(accessToken, 20, 100);
  return { token: accessToken };
}

export function direct() {
  const res = http.get(`${STOCK_DIRECT}/stock?size=20`, params(null, 'directo'));
  check(res, { 'directo responde 200': (r) => r.status === 200 });
  sleep(0.5);
}

export function viaGateway(data) {
  const res = http.get(`${API}/stock?size=20`, params(data.token, 'main'));
  check(res, { 'gateway responde 200': (r) => r.status === 200 });
  sleep(0.5);
}

const diff = (data) => p95Of(data, 'http_req_duration{name:main}') - p95Of(data, 'http_req_duration{name:directo}');

export const handleSummary = summary(
  'M04',
  'Sobrecosto del gateway: GET /stock directo vs. gateway (20 VUs c/u)',
  (data) => `p95 directo ${p95Of(data, 'http_req_duration{name:directo}').toFixed(1)} ms; diferencia ${diff(data).toFixed(1)} ms (máx. ${MAX_DIFF_MS})`,
  (data) => diff(data) < MAX_DIFF_MS,
);
