// M11 - Rate limiting del API Gateway (Entrega 2, §1.1).
// El gateway permite 600 peticiones por minuto por IP. Esta prueba envía 20 por
// segundo durante 60 s (1200 en total) desde una sola IP: a partir de la 600 el
// gateway debe responder 429 en vez de reenviarlas al microservicio.
// run-all.sh reinicia el gateway con el límite normal (600) antes de esta prueba.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { API, login, params, buildOptions, summary } from './lib/common.js';

const limited = new Counter('respuestas_429');
const allowed = new Counter('respuestas_200');

export const options = buildOptions({
  scenarios: {
    rafaga: { executor: 'constant-arrival-rate', rate: 20, timeUnit: '1s', duration: '60s', preAllocatedVUs: 10, maxVUs: 30 },
  },
  thresholds: { respuestas_429: ['count>0'] },
});

export function setup() {
  return { token: login().accessToken };
}

export default function (data) {
  // 429 es la respuesta ESPERADA cuando se supera el límite.
  const res = http.get(`${API}/stock?size=1`, params(data.token, 'main', { responseCallback: http.expectedStatuses(200, 429) }));
  if (res.status === 429) limited.add(1);
  if (res.status === 200) allowed.add(1);
  check(res, {
    'responde 200 o 429': (r) => r.status === 200 || r.status === 429,
    '429 trae Retry-After': (r) => r.status !== 429 || Boolean(r.headers['Retry-After']),
  });
}

export const handleSummary = summary(
  'M11',
  'Rate limiting: 20 req/s durante 60 s desde una IP (límite 600/min)',
  (data) => {
    const ok = data.metrics.respuestas_200 ? data.metrics.respuestas_200.values.count : 0;
    const lim = data.metrics.respuestas_429 ? data.metrics.respuestas_429.values.count : 0;
    return `${ok} atendidas y ${lim} limitadas con 429`;
  },
);
