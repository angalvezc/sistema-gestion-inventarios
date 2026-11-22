// A13 - Registro de devoluciones (RF11).
// 20 usuarios registran devoluciones con un ítem RESTOCK (vuelve a BOD-A) y uno
// DAMAGED (baja por avería) durante 1 minuto. Cada devolución publica return.processed.
// Al final se comprueba que el stock subió exactamente lo devuelto en RESTOCK.
// Criterio: p95 < 1.5 s y el stock cuadra con las devoluciones.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API, BOD_A, BOD_B, login, runId, seedCatalog, pick, unitsIn, params, buildOptions, summary } from './lib/common.js';

const registered = new Counter('devoluciones_registradas');

export const options = buildOptions({
  vus: 20,
  duration: '1m',
  p95: 1500,
  thresholds: { 'checks{tipo:stock}': ['rate==1'] },
});

export function setup() {
  const { accessToken } = login();
  const products = seedCatalog(accessToken, runId(), 5);
  const before = {};
  products.forEach((id) => { before[id] = unitsIn(accessToken, id, BOD_A); });
  return { token: accessToken, products, before, returnsBefore: totalReturns(accessToken) };
}

function totalReturns(token) {
  return http.get(`${API}/audit/returns?size=1`, params(token, 'setup')).json('totalElements');
}

export default function (data) {
  const res = http.post(`${API}/audit/returns`, JSON.stringify({
    origin: Math.random() < 0.5 ? 'CLIENT' : 'SUPPLIER',
    reason: 'Prueba de rendimiento A13',
    items: [
      { productId: pick(data.products), quantity: 1, disposition: 'RESTOCK', warehouseId: BOD_A },
      { productId: pick(data.products), quantity: 1, disposition: 'DAMAGED', warehouseId: BOD_B },
    ],
  }), params(data.token, 'main'));
  if (res.status === 201) registered.add(1);
  check(res, { 'devolución registrada como PROCESSED': (r) => r.status === 201 && r.json('status') === 'PROCESSED' });
  sleep(0.5);
}

// Cada devolución registrada en esta prueba trae exactamente 1 unidad RESTOCK para
// BOD-A: el stock de BOD-A debe subir tantas unidades como devoluciones nuevas haya.
// Espera (hasta 60 s) a que stock aplique todos los eventos return.processed.
export function teardown(data) {
  const expected = totalReturns(data.token) - data.returnsBefore;
  const restockedNow = () => data.products.reduce((sum, id) => sum + unitsIn(data.token, id, BOD_A) - data.before[id], 0);
  let restocked = restockedNow();
  for (let i = 0; i < 60 && restocked < expected; i += 1) {
    sleep(1);
    restocked = restockedNow();
  }
  console.log(`A13: ${expected} devoluciones nuevas; unidades RESTOCK que volvieron a BOD-A: ${restocked}`);
  check(restocked, { 'BOD-A subió exactamente 1 unidad por devolución': (u) => u === expected }, { tipo: 'stock' });
}

export const handleSummary = summary(
  'A13',
  'Registro de devoluciones RESTOCK + DAMAGED (20 VUs, 1 min)',
  (data) => {
    const n = data.metrics.devoluciones_registradas ? data.metrics.devoluciones_registradas.values.count : 0;
    return `${n} devoluciones registradas; cada una reingresó 1 unidad a BOD-A por evento`;
  },
);
