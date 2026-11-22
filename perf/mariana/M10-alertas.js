// M10 - Consulta de alertas de stock bajo GET /stock/alerts (RF06).
// Se preparan 30 productos: a la mitad se le pone un umbral mínimo mayor que su
// saldo para que aparezcan como alerta LOW. 50 usuarios consultan durante 1 minuto.
// Criterio: p95 < 1 s y que las alertas aparezcan.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, BOD_A, login, seedProducts, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 50, duration: '1m', p95: 1000 });

export function setup() {
  const { accessToken } = login();
  const products = seedProducts(accessToken, 30, 10);
  products.slice(0, 15).forEach((id) => {
    http.put(`${API}/stock/${id}/min-threshold`, JSON.stringify({ warehouseId: BOD_A, minThreshold: 20 }),
      params(accessToken, 'setup'));
  });
  return { token: accessToken };
}

export default function (data) {
  const res = http.get(`${API}/stock/alerts`, params(data.token, 'main'));
  check(res, { 'devuelve alertas': (r) => r.status === 200 && r.json().length > 0 });
  sleep(1);
}

export const handleSummary = summary('M10', 'Alertas de stock bajo GET /stock/alerts (50 VUs, 1 min)');
