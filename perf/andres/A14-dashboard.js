// A14 - Métricas del dashboard GET /audit/dashboard/metrics (RF12).
// Cada consulta calcula el saldo actual de todos los productos a partir del Kardex
// (DISTINCT ON) y el valor del inventario con los precios de ms-products (en caché).
// 50 usuarios durante 1 minuto. Criterio: p95 < 2 s y valor del inventario disponible.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 50, duration: '1m', p95: 2000 });

export function setup() {
  return { token: login().accessToken };
}

export default function (data) {
  const res = http.get(`${API}/audit/dashboard/metrics`, params(data.token, 'main'));
  check(res, {
    'responde 200': (r) => r.status === 200,
    'valor del inventario disponible': (r) => r.status === 200 && r.json('inventoryValueAvailable') === true,
  });
  sleep(1);
}

export const handleSummary = summary('A14', 'Métricas del dashboard (50 VUs, 1 min)');
