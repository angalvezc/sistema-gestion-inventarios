// A07 - Creación de órdenes de compra (RF09).
// Cada orden obliga a ms-purchases a consultar por REST a ms-suppliers y a ms-products
// (Entrega 2, §1.2) antes de guardarla: mide el costo de esa comunicación síncrona.
// 30 usuarios durante 2 minutos. Criterio: p95 < 2 s.
import { check, sleep } from 'k6';
import { login, runId, seedCatalog, seedSuppliers, pick, createOrder, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 30, duration: '2m', p95: 2000 });

export function setup() {
  const { accessToken } = login();
  const run = runId();
  return {
    token: accessToken,
    products: seedCatalog(accessToken, run, 20),
    suppliers: seedSuppliers(accessToken, run, 5),
  };
}

export default function (data) {
  const res = createOrder(data.token, pick(data.suppliers), pick(data.products), 1 + Math.floor(Math.random() * 20), 'main');
  check(res, { 'orden creada en DRAFT con el SKU copiado': (r) => r.status === 201 && r.json('status') === 'DRAFT' && Boolean(r.json('items.0.sku')) });
  sleep(1);
}

export const handleSummary = summary('A07', 'Crear órdenes de compra con validación REST (30 VUs, 2 min)');
