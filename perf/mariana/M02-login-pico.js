// M02 - Login en pico de demanda (RF01).
// Rampa de 0 a 100 usuarios: simula el inicio de turno en las dos bodegas.
// Criterio: p95 < 1 s y menos de 1 % de errores.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, ADMIN, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  p95: 1000,
});

export default function () {
  const res = http.post(`${API}/auth/login`, JSON.stringify(ADMIN), params(null, 'main'));
  check(res, { 'login responde 200': (r) => r.status === 200 });
  sleep(1);
}

export const handleSummary = summary('M02', 'Login en pico (rampa 0 → 100 VUs, 2 min)');
