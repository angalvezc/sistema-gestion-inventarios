// M07 - Prueba de estrés de la consulta de stock (RNF06, RNF10).
// Sube la carga por escalones hasta 300 usuarios para encontrar el punto de quiebre:
// el nivel de carga en el que el p95 supera los 2 s o empiezan los errores.
// Cada petición se etiqueta con el nivel de usuarios activos (50, 100, ..., 300).
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { API, login, seedProducts, pick, params, buildOptions, summary, p95Of } from './lib/common.js';

const LEVELS = [50, 100, 150, 200, 250, 300];
const LIMIT_MS = 2000;

const levelThresholds = {};
LEVELS.forEach((l) => { levelThresholds[`http_req_duration{nivel:${l}}`] = ['p(95)>=0']; });

export const options = buildOptions({
  stages: [
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 150 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 250 },
    { duration: '1m', target: 300 },
    { duration: '30s', target: 0 },
  ],
  errorRate: 0.05, // en estrés se tolera hasta 5 %: el objetivo es ver dónde se degrada
  thresholds: levelThresholds,
});

export function setup() {
  const { accessToken } = login();
  return { token: accessToken, products: seedProducts(accessToken, 50, 100) };
}

export default function (data) {
  const level = Math.max(50, Math.ceil(exec.instance.vusActive / 50) * 50);
  const res = http.get(`${API}/stock/${pick(data.products)}`,
    params(data.token, 'main', { tags: { name: 'main', nivel: String(level) } }));
  check(res, { 'responde 200': (r) => r.status === 200 });
  sleep(0.5);
}

function curve(data) {
  return LEVELS
    .filter((l) => typeof p95Of(data, `http_req_duration{nivel:${l}}`) === 'number')
    .map((l) => ({ l, p95: p95Of(data, `http_req_duration{nivel:${l}}`) }));
}

export const handleSummary = summary(
  'M07',
  'Estrés de GET /stock/{id} (rampa 50 → 300 VUs, 6.5 min)',
  (data) => {
    const points = curve(data);
    const broken = points.find((p) => p.p95 >= LIMIT_MS);
    const text = points.map((p) => `${p.l} VUs: ${p.p95.toFixed(0)} ms`).join(' · ');
    return `p95 por nivel → ${text}. ${broken ? `Punto de quiebre (p95 ≥ 2 s): ${broken.l} VUs` : 'No se alcanzó el punto de quiebre hasta 300 VUs'}`;
  },
);
