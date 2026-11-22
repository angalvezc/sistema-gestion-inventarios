// M12 - Rechazo de peticiones sin token o con token inválido (RNF07).
// 100 usuarios envían peticiones a una ruta protegida: sin token, con un token
// mal formado o con la firma alterada. El gateway debe rechazarlas todas con 401
// rápidamente, sin llegar a los microservicios.
// Criterio: 100 % de 401 y p95 < 100 ms.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API, login, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 100, duration: '1m', p95: 100 });

export function setup() {
  const parts = login().accessToken.split('.');
  // Mismo token con el PRIMER carácter de la firma cambiado: la firma deja de coincidir.
  // (No se usa el último: en base64url algunos de sus bits son de relleno y cambiarlo
  // podría no alterar la firma real.)
  const signature = parts[2];
  const altered = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  return { tampered: `${parts[0]}.${parts[1]}.${altered}` };
}

export default function (data) {
  const token = [null, 'esto-no-es-un-jwt', data.tampered][Math.floor(Math.random() * 3)];
  // 401 es la respuesta ESPERADA en esta prueba.
  const res = http.get(`${API}/stock`, params(token, 'main', { responseCallback: http.expectedStatuses(401) }));
  check(res, { 'rechazada con 401': (r) => r.status === 401 });
  sleep(0.5);
}

export const handleSummary = summary('M12', 'Rechazo de JWT ausente, mal formado o alterado (100 VUs, 1 min)');
