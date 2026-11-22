// M05 - Consulta de saldos GET /stock (RF03, RNF06).
// RNF06: el 95 % de las consultas de disponibilidad debe responder en menos de 2 s.
// 50 usuarios recorriendo páginas del listado durante 2 minutos.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, seedProducts, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 50, duration: '2m', p95: 2000 });

export function setup() {
  const { accessToken } = login();
  seedProducts(accessToken, 50, 100); // 50 productos x 2 bodegas = 100 saldos
  return { token: accessToken };
}

export default function (data) {
  const page = Math.floor(Math.random() * 5);
  const res = http.get(`${API}/stock?page=${page}&size=20`, params(data.token, 'main'));
  check(res, { 'responde 200 con content': (r) => r.status === 200 && Array.isArray(r.json('content')) });
  sleep(1);
}

export const handleSummary = summary('M05', 'Consulta de saldos GET /stock (50 VUs, 2 min) — RNF06');
