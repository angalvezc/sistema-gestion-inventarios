// M14 - Latencia de la mensajería asíncrona (RF10, RNF08).
// Publica directamente en RabbitMQ 200 eventos purchase.received (1 unidad cada uno),
// como si los enviara ms-purchases, y mide cuánto tarda ms-inventory-stock en
// aplicarlos todos. Además cada evento se publica 2 veces con el mismo eventId:
// el stock final debe ser 200, no 400 (idempotencia bajo carga).
// Criterio: los 200 eventos aplicados en menos de 30 s y sin duplicados.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Gauge } from 'k6/metrics';
import { BOD_B, RABBIT_API, login, uuid, productStock, buildOptions, summary } from './lib/common.js';

const EVENTS = 200;
const TIMEOUT_S = 60;

const drainTime = new Trend('tiempo_aplicacion_ms', true);
const appliedUnits = new Gauge('unidades_aplicadas');

export const options = buildOptions({
  scenarios: { mensajeria: { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: '3m' } },
  p95: 500,
  thresholds: {
    tiempo_aplicacion_ms: ['max<30000'],
    unidades_aplicadas: [`value==${EVENTS}`],
  },
});

const rabbitUser = encodeURIComponent(__ENV.RABBITMQ_USER || '');
const rabbitPass = encodeURIComponent(__ENV.RABBITMQ_PASSWORD || '');
const publishUrl = `${RABBIT_API.replace('://', `://${rabbitUser}:${rabbitPass}@`)}/exchanges/%2F/logitech.events/publish`;

function publish(envelope) {
  return http.post(publishUrl, JSON.stringify({
    properties: { delivery_mode: 2, content_type: 'application/json' },
    routing_key: 'purchase.received',
    payload: JSON.stringify(envelope),
    payload_encoding: 'string',
  }), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'main' } });
}

export function setup() {
  return { token: login().accessToken, productId: uuid() };
}

export default function (data) {
  const start = Date.now();
  for (let i = 0; i < EVENTS; i += 1) {
    const envelope = {
      eventId: uuid(),
      eventType: 'purchase.received',
      occurredAt: new Date().toISOString(),
      producer: 'k6-M14',
      payload: { orderNumber: `OC-PERF-${i}`, warehouseId: BOD_B, items: [{ productId: data.productId, quantity: 1 }] },
    };
    const first = publish(envelope);
    publish(envelope); // reentrega del MISMO evento: no debe sumar otra vez
    check(first, { 'RabbitMQ enrutó el evento': (r) => r.status === 200 && r.json('routed') === true });
  }

  // Espera hasta ver los 200 aplicados (o el tiempo límite).
  let units = 0;
  while ((Date.now() - start) / 1000 < TIMEOUT_S) {
    units = productStock(data.token, data.productId).warehouses[1].quantity;
    if (units >= EVENTS) break;
    sleep(0.2);
  }
  const elapsed = Date.now() - start;
  sleep(3); // margen para detectar duplicados que llegaran tarde
  units = productStock(data.token, data.productId).warehouses[1].quantity;

  drainTime.add(elapsed);
  appliedUnits.add(units);
  check(units, { 'stock = 200: todos aplicados y sin duplicados': (u) => u === EVENTS });
}

export const handleSummary = summary(
  'M14',
  `Mensajería: ${EVENTS} purchase.received (+${EVENTS} duplicados) hasta verse en stock`,
  (data) => {
    const t = data.metrics.tiempo_aplicacion_ms ? data.metrics.tiempo_aplicacion_ms.values.max : NaN;
    const u = data.metrics.unidades_aplicadas ? data.metrics.unidades_aplicadas.values.value : 0;
    return `Stock final ${u} (esperado ${EVENTS}); todos aplicados en ${(t / 1000).toFixed(1)} s. Los tiempos de la tabla son los de publicar en RabbitMQ`;
  },
);
