// A10 - Ráfaga de recepciones simultáneas (RF10, RNF08).
// Se preparan 100 órdenes aprobadas de 1 unidad del mismo producto y 50 usuarios
// las reciben todas al mismo tiempo. Los 100 eventos purchase.received pasan por
// RabbitMQ y stock debe aplicarlos todos: el saldo final debe ser exactamente 100.
// Criterio: recepción p95 < 2 s y las 100 unidades en stock en menos de 30 s.
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Trend, Gauge } from 'k6/metrics';
import { BOD_B, login, runId, seedCatalog, seedSuppliers, approvedOrder, orderAction, unitsIn, buildOptions, summary } from './lib/common.js';

const ORDERS = 100;
const drainTime = new Trend('tiempo_drenado_ms', true);
const finalUnits = new Gauge('unidades_en_stock');

export const options = buildOptions({
  scenarios: { rafaga: { executor: 'shared-iterations', vus: 50, iterations: ORDERS, maxDuration: '2m' } },
  p95: 2000,
  setupTimeout: '3m', // preparar 100 órdenes aprobadas toma un momento
  thresholds: {
    tiempo_drenado_ms: ['max<30000'],
    unidades_en_stock: [`value==${ORDERS}`],
  },
});

export function setup() {
  const { accessToken } = login();
  const run = runId();
  const productId = seedCatalog(accessToken, run, 1)[0];
  const supplier = seedSuppliers(accessToken, run, 1)[0];
  const orders = [];
  for (let i = 0; i < ORDERS; i += 1) orders.push(approvedOrder(accessToken, supplier, productId, 1, BOD_B));
  return { token: accessToken, productId, orders };
}

export default function (data) {
  const orderId = data.orders[exec.scenario.iterationInTest];
  const res = orderAction(data.token, orderId, 'receive', 'main');
  check(res, { 'orden recibida': (r) => r.status === 200 });
}

// Al terminar la ráfaga: espera a que stock aplique los 100 eventos.
export function teardown(data) {
  const start = Date.now();
  let units = 0;
  while (Date.now() - start < 60000) {
    units = unitsIn(data.token, data.productId, BOD_B);
    if (units >= ORDERS) break;
    sleep(0.2);
  }
  drainTime.add(Date.now() - start);
  finalUnits.add(units);
  check(units, { 'stock final = 100: ningún evento perdido ni duplicado': (u) => u === ORDERS });
}

export const handleSummary = summary(
  'A10',
  `Ráfaga: ${ORDERS} recepciones simultáneas (50 VUs)`,
  (data) => {
    const t = data.metrics.tiempo_drenado_ms ? data.metrics.tiempo_drenado_ms.values.max : NaN;
    const u = data.metrics.unidades_en_stock ? data.metrics.unidades_en_stock.values.value : 0;
    return `Stock final ${u} (esperado ${ORDERS}); los eventos pendientes se aplicaron ${(t / 1000).toFixed(1)} s después de terminar la ráfaga`;
  },
);
