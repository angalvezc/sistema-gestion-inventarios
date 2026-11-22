// M15 - Caída de RabbitMQ durante la carga (RNF09).
// 30 usuarios registran movimientos durante 90 s. run-all.sh APAGA RabbitMQ cerca
// del segundo 30 y lo ENCIENDE cerca del segundo 60. Como los eventos se guardan en
// el outbox de db_stock, el inventario debe seguir funcionando sin el broker.
// Se compara el p95 antes, durante y después de la caída.
// Criterio: menos de 1 % de errores y p95 < 2 s en todas las fases.
// (run-all.sh verifica después que el outbox quede sin eventos pendientes.)
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { BOD_A, login, seedProducts, pick, movement, buildOptions, summary, p95Of } from './lib/common.js';

const PHASES = ['antes', 'sin_broker', 'despues'];

const phaseThresholds = {};
PHASES.forEach((p) => { phaseThresholds[`http_req_duration{fase:${p}}`] = ['p(95)<2000']; });

export const options = buildOptions({ vus: 30, duration: '90s', p95: 2000, thresholds: phaseThresholds });

export function setup() {
  const { accessToken } = login();
  return { token: accessToken, products: seedProducts(accessToken, 20, 100) };
}

function phase() {
  const s = (Date.now() - exec.scenario.startTime) / 1000;
  if (s < 30) return 'antes';
  if (s < 60) return 'sin_broker';
  return 'despues';
}

export default function (data) {
  const res = movement(data.token, pick(data.products), BOD_A, 'ENTRY', 1, 'PERF-M15', 'main',
    { tags: { name: 'main', fase: phase() } });
  check(res, { 'movimiento registrado (201)': (r) => r.status === 201 });
  sleep(0.5);
}

export const handleSummary = summary(
  'M15',
  'Caída de RabbitMQ durante la carga: movimientos (30 VUs, 90 s; broker apagado ~30–60 s)',
  (data) => PHASES.map((p) => {
    const v = p95Of(data, `http_req_duration{fase:${p}}`);
    return `p95 ${p.replace('_', ' ')}: ${typeof v === 'number' ? v.toFixed(1) : '-'} ms`;
  }).join(' · '),
);
