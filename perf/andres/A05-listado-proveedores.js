// A05 - Directorio de proveedores GET /suppliers (RF08).
// 50 usuarios consultan el directorio (listado y búsqueda) durante 1 minuto.
// Criterio: p95 < 1 s.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, runId, seedSuppliers, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 50, duration: '1m', p95: 1000 });

export function setup() {
  const { accessToken } = login();
  const run = runId();
  seedSuppliers(accessToken, run, 30);
  return { token: accessToken, run };
}

export default function (data) {
  const url = Math.random() < 0.5
    ? `${API}/suppliers?size=20`
    : `${API}/suppliers?q=${encodeURIComponent(`prueba ${data.run}`)}`;
  const res = http.get(url, params(data.token, 'main'));
  check(res, { 'responde 200 con proveedores': (r) => r.status === 200 && r.json('totalElements') > 0 });
  sleep(1);
}

export const handleSummary = summary('A05', 'Directorio de proveedores GET /suppliers (50 VUs, 1 min)');
