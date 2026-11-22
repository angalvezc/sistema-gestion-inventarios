// A03 - Creación concurrente con el mismo SKU (RF02: SKU único).
// 20 usuarios intentan crear, al mismo tiempo, productos con el MISMO SKU, en 5 rondas
// (un SKU distinto por ronda). El UNIQUE de PostgreSQL debe dejar crear exactamente
// uno por ronda: 5 creados (201) y 95 rechazados (409), sin errores 500.
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { API, login, runId, categoryId, productBody, params, buildOptions, summary } from './lib/common.js';

const VUS = 20;
const ROUNDS = 5;

const created = new Counter('productos_creados');
const duplicates = new Counter('rechazados_por_duplicado');

export const options = buildOptions({
  scenarios: { rondas: { executor: 'per-vu-iterations', vus: VUS, iterations: ROUNDS, maxDuration: '2m' } },
  p95: 2000,
  thresholds: {
    productos_creados: [`count==${ROUNDS}`],
    rechazados_por_duplicado: [`count==${VUS * ROUNDS - ROUNDS}`],
  },
});

export function setup() {
  const { accessToken } = login();
  return { token: accessToken, run: runId(), catId: categoryId(accessToken) };
}

export default function (data) {
  const round = exec.vu.iterationInScenario; // 0..4: todos los usuarios de la ronda chocan
  const vu = exec.vu.idInTest;
  // Mismo SKU para toda la ronda; el código de barras sí es distinto, para que el
  // conflicto sea solo por el SKU.
  const body = Object.assign(productBody(data.run, vu * 10 + round, data.catId), { sku: `DUP-${data.run}-${round}` });
  const res = http.post(`${API}/products`, JSON.stringify(body),
    params(data.token, 'main', { responseCallback: http.expectedStatuses(201, 409) }));
  if (res.status === 201) created.add(1);
  if (res.status === 409) duplicates.add(1);
  check(res, { 'responde 201 o 409 (nunca 500)': (r) => r.status === 201 || r.status === 409 });
}

export const handleSummary = summary(
  'A03',
  `Creación concurrente con SKU duplicado (${VUS} VUs x ${ROUNDS} rondas)`,
  (data) => {
    const c = data.metrics.productos_creados ? data.metrics.productos_creados.values.count : 0;
    const d = data.metrics.rechazados_por_duplicado ? data.metrics.rechazados_por_duplicado.values.count : 0;
    return `${c} creados y ${d} rechazados con 409 (esperado ${ROUNDS} / ${VUS * ROUNDS - ROUNDS})`;
  },
);
