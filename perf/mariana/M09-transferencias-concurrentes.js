// M09 - Transferencias concurrentes en ambos sentidos A <-> B (RF05).
// 30 usuarios mueven entre 1 y 5 unidades del mismo producto, al azar de A a B o de
// B a A, durante 1 minuto. Las transferencias no crean ni destruyen mercancía:
// la suma de las dos bodegas debe seguir siendo exactamente la inicial y ninguna
// queda negativa. También comprueba que no haya bloqueos mutuos (deadlocks).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, BOD_A, BOD_B, login, uuid, addStock, productStock, params, buildOptions, summary } from './lib/common.js';

const PER_WAREHOUSE = 500;

export const options = buildOptions({
  vus: 30,
  duration: '1m',
  p95: 2000,
  thresholds: { 'checks{tipo:invariante}': ['rate==1'] },
});

export function setup() {
  const { accessToken } = login();
  const productId = uuid();
  addStock(accessToken, productId, BOD_A, PER_WAREHOUSE);
  addStock(accessToken, productId, BOD_B, PER_WAREHOUSE);
  return { token: accessToken, productId };
}

export default function (data) {
  const aToB = Math.random() < 0.5;
  const body = {
    productId: data.productId,
    fromWarehouseId: aToB ? BOD_A : BOD_B,
    toWarehouseId: aToB ? BOD_B : BOD_A,
    quantity: 1 + Math.floor(Math.random() * 5),
  };
  // 409 puede ocurrir si una bodega se vacía momentáneamente: es esperado.
  const res = http.post(`${API}/stock/transfers`, JSON.stringify(body),
    params(data.token, 'main', { responseCallback: http.expectedStatuses(201, 409) }));
  check(res, { 'responde 201 o 409': (r) => r.status === 201 || r.status === 409 });
  sleep(0.2);
}

export function teardown(data) {
  const stock = productStock(data.token, data.productId);
  const a = stock.warehouses[0].quantity;
  const b = stock.warehouses[1].quantity;
  check({ a, b }, {
    'la suma A + B se conserva': (s) => s.a + s.b === PER_WAREHOUSE * 2,
    'ninguna bodega queda negativa': (s) => s.a >= 0 && s.b >= 0,
  }, { tipo: 'invariante' });
  console.log(`M09 saldo final: BOD-A ${a}, BOD-B ${b}, total ${a + b} (esperado ${PER_WAREHOUSE * 2})`);
}

export const handleSummary = summary(
  'M09',
  'Transferencias concurrentes A ↔ B (30 VUs, 1 min)',
  (data) => {
    const inv = data.metrics['checks{tipo:invariante}'];
    return inv && inv.values.rate === 1
      ? `Suma A + B constante (${PER_WAREHOUSE * 2}) y sin saldos negativos`
      : 'La suma A + B NO se conservó';
  },
);
