// M08 - Salidas concurrentes sobre el mismo producto (RF04).
// Hay 100 unidades y 50 usuarios intentan 300 salidas de 1 unidad al mismo tiempo.
// Si la resta atómica funciona: exactamente 100 aceptadas (201), 200 rechazadas (409)
// y saldo final 0. Nunca negativo, nunca más salidas que unidades.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BOD_A, login, uuid, addStock, movement, productStock, buildOptions, summary } from './lib/common.js';

const INITIAL = 100;
const ATTEMPTS = 300;

const accepted = new Counter('salidas_aceptadas');
const rejected = new Counter('salidas_rechazadas');

export const options = buildOptions({
  scenarios: {
    salidas: { executor: 'shared-iterations', vus: 50, iterations: ATTEMPTS, maxDuration: '2m' },
  },
  p95: 2000,
  thresholds: {
    salidas_aceptadas: [`count==${INITIAL}`],
    salidas_rechazadas: [`count==${ATTEMPTS - INITIAL}`],
    'checks{tipo:invariante}': ['rate==1'],
  },
});

export function setup() {
  const { accessToken } = login();
  const productId = uuid();
  addStock(accessToken, productId, BOD_A, INITIAL);
  return { token: accessToken, productId };
}

export default function (data) {
  // 409 (saldo insuficiente) es una respuesta ESPERADA aquí, no un error.
  const res = movement(data.token, data.productId, BOD_A, 'EXIT', 1, 'PERF-M08', 'main', {
    responseCallback: http.expectedStatuses(201, 409),
  });
  if (res.status === 201) accepted.add(1);
  if (res.status === 409) rejected.add(1);
  check(res, { 'responde 201 o 409': (r) => r.status === 201 || r.status === 409 });
}

export function teardown(data) {
  const final = productStock(data.token, data.productId).warehouses[0].quantity;
  check(final, {
    'el saldo final nunca es negativo': (q) => q >= 0,
    'el saldo final es exactamente 0': (q) => q === 0,
  }, { tipo: 'invariante' });
}

export const handleSummary = summary(
  'M08',
  `Salidas concurrentes: ${ATTEMPTS} intentos sobre ${INITIAL} unidades (50 VUs)`,
  (data) => {
    const a = data.metrics.salidas_aceptadas ? data.metrics.salidas_aceptadas.values.count : 0;
    const r = data.metrics.salidas_rechazadas ? data.metrics.salidas_rechazadas.values.count : 0;
    return `${a} aceptadas, ${r} rechazadas por saldo insuficiente (esperado ${INITIAL} / ${ATTEMPTS - INITIAL})`;
  },
);
