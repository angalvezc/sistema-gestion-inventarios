// A08 - Aprobación de órdenes DRAFT -> APPROVED (RF09).
// Cada usuario crea una orden (preparación, no se mide) y la aprueba (se mide).
// La aprobación bloquea la fila (SELECT ... FOR UPDATE), valida la transición y
// registra el historial en una transacción. 20 usuarios durante 1 minuto.
// Criterio: p95 < 1 s.
import { check, sleep } from 'k6';
import { login, runId, seedCatalog, seedSuppliers, pick, createOrder, orderAction, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 20, duration: '1m', p95: 1000 });

export function setup() {
  const { accessToken } = login();
  const run = runId();
  return {
    token: accessToken,
    products: seedCatalog(accessToken, run, 10),
    suppliers: seedSuppliers(accessToken, run, 3),
  };
}

export default function (data) {
  const created = createOrder(data.token, pick(data.suppliers), pick(data.products), 5, 'setup');
  if (created.status !== 201) return;
  const res = orderAction(data.token, created.json('id'), 'approve', 'main');
  check(res, {
    'orden aprobada': (r) => r.status === 200 && r.json('status') === 'APPROVED',
    'historial DRAFT -> APPROVED': (r) => r.status === 200 && r.json('history').length === 2,
  });
  sleep(0.5);
}

export const handleSummary = summary('A08', 'Aprobar órdenes de compra (20 VUs, 1 min)');
