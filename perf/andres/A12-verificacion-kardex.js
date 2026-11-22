// A12 - Verificación de la cadena de hashes del Kardex (RNF12).
// GET /audit/kardex/verify recalcula el SHA-256 de TODOS los registros en orden:
// su costo crece con el tamaño del Kardex. Mientras 3 auditores verifican durante
// 1 minuto, otros 10 usuarios siguen registrando movimientos (nuevas filas al final
// de la cadena). La cadena debe reportarse íntegra siempre.
// Criterio: p95 < 5 s y 100 % de verificaciones "válidas".
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, BOD_A, login, uuid, addStock, movement, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({
  scenarios: {
    auditores: { executor: 'constant-vus', exec: 'verify', vus: 3, duration: '1m' },
    operarios: { executor: 'constant-vus', exec: 'write', vus: 10, duration: '1m' },
  },
  p95: 5000,
  thresholds: { 'checks{tipo:cadena}': ['rate==1'] },
});

export function setup() {
  const { accessToken } = login();
  const productId = uuid();
  addStock(accessToken, productId, BOD_A, 10);
  return { token: accessToken, productId };
}

export function verify(data) {
  const res = http.get(`${API}/audit/kardex/verify`, params(data.token, 'main', { timeout: '60s' }));
  check(res, { 'la cadena está íntegra': (r) => r.status === 200 && r.json('valid') === true }, { tipo: 'cadena' });
  sleep(1);
}

export function write(data) {
  movement(data.token, data.productId, BOD_A, 'ENTRY', 1, 'PERF-A12', 'setup');
  sleep(0.5);
}

export const handleSummary = summary(
  'A12',
  'Verificación de la cadena del Kardex mientras se registran movimientos (3 + 10 VUs, 1 min)',
  (data) => {
    const c = data.metrics['checks{tipo:cadena}'];
    return c ? `${(c.values.rate * 100).toFixed(0)} % de las verificaciones reportaron la cadena íntegra` : '';
  },
);
