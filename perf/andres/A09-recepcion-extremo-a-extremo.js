// A09 - Recepción de mercancía de extremo a extremo (RF10).
// Mide el tiempo desde que el operario confirma la recepción en ms-purchases hasta
// que las unidades aparecen en ms-inventory-stock, pasando por el outbox y RabbitMQ.
// 10 usuarios durante 1 minuto; cada uno trabaja con su propio producto para poder
// saber exactamente cuánto debe subir el stock.
// Criterio: recepción p95 < 1 s y latencia de extremo a extremo p95 < 3 s.
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BOD_B, login, runId, seedCatalog, seedSuppliers, approvedOrder, orderAction, unitsIn, buildOptions, summary } from './lib/common.js';

const VUS = 10;
const endToEnd = new Trend('latencia_extremo_a_extremo_ms', true);

export const options = buildOptions({
  vus: VUS,
  duration: '1m',
  p95: 1000,
  thresholds: { latencia_extremo_a_extremo_ms: ['p(95)<3000'] },
});

export function setup() {
  const { accessToken } = login();
  const run = runId();
  return {
    token: accessToken,
    products: seedCatalog(accessToken, run, VUS), // un producto por usuario
    supplier: seedSuppliers(accessToken, run, 1)[0],
  };
}

export default function (data) {
  const productId = data.products[exec.vu.idInTest - 1];
  const quantity = 5;
  const orderId = approvedOrder(data.token, data.supplier, productId, quantity, BOD_B);
  const before = unitsIn(data.token, productId, BOD_B);

  const start = Date.now();
  const res = orderAction(data.token, orderId, 'receive', 'main');
  check(res, { 'orden recibida': (r) => r.status === 200 && r.json('status') === 'RECEIVED' });

  // Espera a ver las unidades en stock (máximo 15 s).
  let now = before;
  while (now < before + quantity && Date.now() - start < 15000) {
    sleep(0.05);
    now = unitsIn(data.token, productId, BOD_B);
  }
  endToEnd.add(Date.now() - start);
  check(now, { 'el stock subió exactamente lo recibido': (u) => u === before + quantity });
  sleep(1);
}

export const handleSummary = summary(
  'A09',
  'Recepción de órdenes hasta verse en stock (10 VUs, 1 min)',
  (data) => {
    const t = data.metrics.latencia_extremo_a_extremo_ms;
    return t ? `Latencia de extremo a extremo (compras → RabbitMQ → stock): mediana ${t.values.med.toFixed(0)} ms, p95 ${t.values['p(95)'].toFixed(0)} ms` : '';
  },
);
