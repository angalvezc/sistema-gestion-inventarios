// M13 - Prueba de resistencia (soak) del inventario (RNF06, RNF09).
// 30 usuarios con un uso mixto y realista durante 10 minutos:
//   70 % consulta saldo de un producto, 20 % listado, 10 % entradas/salidas.
// Busca degradación con el tiempo (fugas de memoria, conexiones sin liberar):
// se compara el p95 de los 2 primeros minutos con el de los 2 últimos.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { API, BOD_A, login, seedProducts, pick, movement, params, buildOptions, summary, p95Of } from './lib/common.js';

const DURATION_MIN = 10;
const MAX_DEGRADATION = 1.5; // el p95 final no debe superar 1.5 veces el inicial

export const options = buildOptions({
  vus: 30,
  duration: `${DURATION_MIN}m`,
  p95: 2000,
  thresholds: {
    'http_req_duration{fase:inicio}': ['p(95)>=0'],
    'http_req_duration{fase:final}': ['p(95)>=0'],
  },
});

export function setup() {
  const { accessToken } = login();
  return { token: accessToken, products: seedProducts(accessToken, 50, 1000) };
}

function phase() {
  const minute = (Date.now() - exec.scenario.startTime) / 60000;
  if (minute < 2) return 'inicio';
  if (minute >= DURATION_MIN - 2) return 'final';
  return 'medio';
}

export default function (data) {
  const extra = { tags: { name: 'main', fase: phase() }, responseCallback: http.expectedStatuses(200, 201, 409) };
  const dice = Math.random();
  let res;
  if (dice < 0.7) {
    res = http.get(`${API}/stock/${pick(data.products)}`, params(data.token, 'main', extra));
  } else if (dice < 0.9) {
    res = http.get(`${API}/stock?size=20`, params(data.token, 'main', extra));
  } else {
    const type = Math.random() < 0.5 ? 'ENTRY' : 'EXIT';
    res = movement(data.token, pick(data.products), BOD_A, type, 1, 'PERF-M13', 'main', extra);
  }
  check(res, { 'respuesta válida': (r) => [200, 201, 409].indexOf(r.status) !== -1 });
  sleep(1);
}

const ratio = (data) => p95Of(data, 'http_req_duration{fase:final}') / p95Of(data, 'http_req_duration{fase:inicio}');

export const handleSummary = summary(
  'M13',
  `Soak: uso mixto del inventario (30 VUs, ${DURATION_MIN} min)`,
  (data) => `p95 primeros 2 min ${p95Of(data, 'http_req_duration{fase:inicio}').toFixed(1)} ms vs. últimos 2 min ${p95Of(data, 'http_req_duration{fase:final}').toFixed(1)} ms (×${ratio(data).toFixed(2)}, máx. ×${MAX_DEGRADATION})`,
  (data) => ratio(data) <= MAX_DEGRADATION,
);
