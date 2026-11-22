// M03 - Renovación de token con rotación (RF01, RNF07).
// Cada usuario hace login una vez y luego renueva su token cada segundo. Como cada
// refresh token sirve una sola vez, siempre usa el último que recibió.
// Criterio: p95 < 300 ms y menos de 1 % de errores.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 30, duration: '1m', p95: 300 });

let refreshToken = null; // propio de cada usuario virtual

export default function () {
  if (!refreshToken) refreshToken = login().refreshToken;

  const res = http.post(`${API}/auth/refresh`, JSON.stringify({ refreshToken }), params(null, 'main'));
  const ok = check(res, {
    'refresh responde 200': (r) => r.status === 200,
    'entrega un refresh token NUEVO': (r) => r.status === 200 && r.json('refreshToken') !== refreshToken,
  });
  refreshToken = ok ? res.json('refreshToken') : null;
  sleep(1);
}

export const handleSummary = summary('M03', 'Refresh de token con rotación (30 VUs, 1 min)');
