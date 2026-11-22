// A06 - Creación de proveedores con contactos (RF08).
// 20 usuarios registran proveedores nuevos (NIT único con dígito de verificación
// DIAN válido) durante 1 minuto. Cada alta guarda proveedor y contacto en una sola
// transacción. Criterio: p95 < 1 s y menos de 1 % de errores.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { API, login, runId, supplierBody, params, buildOptions, summary } from './lib/common.js';

export const options = buildOptions({ vus: 20, duration: '1m', p95: 1000 });

export function setup() {
  return { token: login().accessToken, run: runId() };
}

export default function (data) {
  // Número único por usuario e iteración: no se repite ningún NIT.
  const n = exec.vu.idInTest * 10000 + exec.vu.iterationInScenario;
  const body = Object.assign(supplierBody(data.run, n), {
    contacts: [{ name: 'Contacto de prueba', role: 'Asesor comercial', email: `contacto.${n}@proveedor.co` }],
  });
  const res = http.post(`${API}/suppliers`, JSON.stringify(body), params(data.token, 'main'));
  check(res, { 'proveedor creado (201) con su contacto': (r) => r.status === 201 && r.json('contacts').length === 1 });
  sleep(0.5);
}

export const handleSummary = summary('A06', 'Creación de proveedores con contacto (20 VUs, 1 min)');
