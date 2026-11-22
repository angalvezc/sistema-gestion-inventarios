// A15 - Caída de ms-returns-audit durante la carga (RNF09, Entrega 2 §1.5).
// 20 usuarios registran movimientos durante 90 s. run-all.sh APAGA ms-returns-audit
// cerca del segundo 30 y lo ENCIENDE cerca del segundo 60.
// Según la Entrega 2: "si falla ms-returns-audit, los eventos quedan en la cola de
// RabbitMQ y se consumen al volver el servicio". Se comprueba que:
//   1) el inventario sigue funcionando sin la auditoría (error < 1 %)
//   2) al volver, el Kardex tiene TODOS los movimientos: ninguno se perdió
// Criterio: error < 1 %, p95 < 2 s y 0 movimientos faltantes en el Kardex.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Gauge } from 'k6/metrics';
import { API, BOD_A, login, uuid, addStock, pick, movement, unitsIn, params, buildOptions, summary, p95Of } from './lib/common.js';

const PRODUCTS = 10;
const INITIAL = 1000;
const missing = new Gauge('movimientos_faltantes_en_kardex');

const PHASES = ['antes', 'sin_auditoria', 'despues'];
const phaseThresholds = { movimientos_faltantes_en_kardex: ['value==0'] };
PHASES.forEach((p) => { phaseThresholds[`http_req_duration{fase:${p}}`] = ['p(95)<2000']; });

export const options = buildOptions({
  vus: 20,
  duration: '90s',
  p95: 2000,
  teardownTimeout: '3m',
  thresholds: phaseThresholds,
});

export function setup() {
  const { accessToken } = login();
  // Productos de prueba con una sola entrada inicial (1 registro de Kardex cada uno).
  const products = [];
  for (let i = 0; i < PRODUCTS; i += 1) {
    const id = uuid();
    addStock(accessToken, id, BOD_A, INITIAL);
    products.push(id);
  }
  return { token: accessToken, products };
}

function phase() {
  const s = (Date.now() - exec.scenario.startTime) / 1000;
  if (s < 30) return 'antes';
  if (s < 60) return 'sin_auditoria';
  return 'despues';
}

export default function (data) {
  const res = movement(data.token, pick(data.products), BOD_A, 'ENTRY', 1, 'PERF-A15', 'main',
    { tags: { name: 'main', fase: phase() } });
  check(res, { 'movimiento registrado aunque la auditoría esté caída (201)': (r) => r.status === 201 });
  sleep(0.5);
}

// Movimientos esperados en el Kardex = 1 entrada inicial + (saldo actual - inicial)
// por producto. Espera (hasta 2 min) a que la auditoría consuma lo acumulado.
export function teardown(data) {
  const expected = data.products.reduce((sum, id) => sum + 1 + (unitsIn(data.token, id, BOD_A) - INITIAL), 0);
  const inKardex = () => data.products.reduce((sum, id) => {
    const res = http.get(`${API}/audit/kardex?productId=${id}&size=1`, params(data.token, 'setup'));
    return sum + (res.status === 200 ? res.json('totalElements') : 0);
  }, 0);
  let found = inKardex();
  for (let i = 0; i < 60 && found < expected; i += 1) {
    sleep(2);
    found = inKardex();
  }
  console.log(`A15: movimientos esperados en el Kardex ${expected}, encontrados ${found}`);
  missing.add(expected - found);
}

export const handleSummary = summary(
  'A15',
  'Caída de ms-returns-audit durante la carga (20 VUs, 90 s; auditoría apagada ~30–60 s)',
  (data) => {
    const m = data.metrics.movimientos_faltantes_en_kardex ? data.metrics.movimientos_faltantes_en_kardex.values.value : '?';
    const phases = PHASES.map((p) => {
      const v = p95Of(data, `http_req_duration{fase:${p}}`);
      return `p95 ${p.replace('_', ' ')}: ${typeof v === 'number' ? v.toFixed(1) : '-'} ms`;
    }).join(' · ');
    return `${phases}. Movimientos faltantes en el Kardex tras volver: ${m}`;
  },
);
