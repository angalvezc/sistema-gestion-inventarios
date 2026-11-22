// M01 - Login con carga base (RF01, RNF07).
// 20 usuarios iniciando sesión una vez por segundo durante 1 minuto.
// Criterio: p95 < 500 ms y menos de 1 % de errores.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, ADMIN, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 20, duration: '1m', p95: 500 });

export default function () {
  const res = http.post(`${API}/auth/login`, JSON.stringify(ADMIN), params(null, 'main'));
  check(res, {
    'login responde 200': (r) => r.status === 200,
    'entrega accessToken': (r) => r.status === 200 && Boolean(r.json('accessToken')),
  });
  sleep(1);
}

export const handleSummary = summary('M01', 'Login, carga base (20 VUs, 1 min)');
