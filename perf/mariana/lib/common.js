// Utilidades compartidas por las 15 pruebas de rendimiento de Mariana (k6).
//
// Convención: la petición que se MIDE en cada prueba lleva la etiqueta name=main.
// Las peticiones de preparación (login, siembra de datos) llevan name=setup y no
// afectan los resultados.
import http from 'k6/http';
import { fail } from 'k6';

// Las pruebas corren dentro de la red de Docker Compose (ver run-all.sh).
export const API = `${__ENV.GATEWAY_URL || 'http://api-gateway:8080'}/api/v1`;
export const STOCK_DIRECT = `${__ENV.STOCK_DIRECT_URL || 'http://ms-inventory-stock:8083'}/api/v1`;
export const RABBIT_API = __ENV.RABBIT_API_URL || 'http://rabbitmq:15672/api';
export const ADMIN = { email: __ENV.ADMIN_EMAIL, password: __ENV.ADMIN_PASSWORD };
export const BOD_A = 1;
export const BOD_B = 2;

// UUID v4 para crear productos de prueba (stock acepta cualquier UUID como producto).
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Parámetros de una petición: JSON, token opcional y etiqueta.
export function params(token, name, extra) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return Object.assign({ headers, tags: { name } }, extra || {});
}

export function login(name) {
  if (!ADMIN.email || !ADMIN.password) fail('Faltan las variables ADMIN_EMAIL / ADMIN_PASSWORD');
  const res = http.post(`${API}/auth/login`, JSON.stringify(ADMIN), params(null, name || 'setup'));
  if (res.status !== 200) fail(`El login falló (${res.status}): ${res.body}`);
  return res.json();
}

export function movement(token, productId, warehouseId, type, quantity, reference, name, extra) {
  return http.post(
    `${API}/stock/movements`,
    JSON.stringify({ productId, warehouseId, type, quantity, reference }),
    params(token, name, extra),
  );
}

export function addStock(token, productId, warehouseId, quantity) {
  const res = movement(token, productId, warehouseId, 'ENTRY', quantity, 'PERF-SETUP', 'setup');
  if (res.status !== 201) fail(`No se pudo sembrar stock (${res.status}): ${res.body}`);
}

// Crea `count` productos de prueba con `quantity` unidades en cada bodega.
export function seedProducts(token, count, quantity) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const id = uuid();
    addStock(token, id, BOD_A, quantity);
    addStock(token, id, BOD_B, quantity);
    ids.push(id);
  }
  return ids;
}

export function productStock(token, productId) {
  const res = http.get(`${API}/stock/${productId}`, params(token, 'setup'));
  if (res.status !== 200) fail(`No se pudo consultar el stock (${res.status}): ${res.body}`);
  return res.json();
}

// Opciones comunes: percentiles a reportar y umbrales de la petición medida.
//   p95: milisegundos máximos del percentil 95 (opcional)
//   errorRate: proporción máxima de peticiones fallidas
//   El resto de campos (vus, duration, stages, scenarios...) pasan tal cual a k6.
export function buildOptions(config) {
  const p95 = config.p95;
  const errorRate = config.errorRate === undefined ? 0.01 : config.errorRate;
  const extra = config.thresholds || {};
  const options = {};
  Object.keys(config)
    .filter((k) => ['p95', 'errorRate', 'thresholds'].indexOf(k) === -1)
    .forEach((k) => { options[k] = config[k]; });

  options.summaryTrendStats = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];
  options.thresholds = Object.assign({
    'http_reqs{name:main}': ['count>0'],
    'http_req_failed{name:main}': [`rate<${errorRate}`],
    // Si no hay umbral de tiempo, ">=0" solo sirve para que k6 reporte la métrica.
    'http_req_duration{name:main}': [p95 ? `p(95)<${p95}` : 'p(95)>=0'],
  }, extra);
  return options;
}

const fmt = (v) => (typeof v === 'number' ? v.toFixed(1) : '-');
const values = (data, key) => (data.metrics[key] ? data.metrics[key].values : {});

export function p95Of(data, key) {
  return values(data, key)['p(95)'];
}

function allThresholdsOk(data) {
  return Object.values(data.metrics).every(
    (m) => !m.thresholds || Object.values(m.thresholds).every((t) => t.ok),
  );
}

function failedThresholds(data) {
  const out = [];
  Object.entries(data.metrics).forEach(([name, m]) => {
    Object.entries(m.thresholds || {}).forEach(([rule, t]) => {
      if (!t.ok) out.push(`${name} ${rule}`);
    });
  });
  return out;
}

// Resumen de cada prueba:
//   - en consola, un resumen legible
//   - resultados/<ID>.json con todos los datos de k6
//   - resultados/<ID>.md con la fila de la tabla de RESULTADOS.md
//   notes(data)   -> texto para la columna "Observaciones"
//   verdict(data) -> true/false si la prueba tiene un criterio propio adicional
export function summary(id, description, notes, verdict) {
  return function handleSummary(data) {
    const d = values(data, 'http_req_duration{name:main}');
    const r = values(data, 'http_reqs{name:main}');
    const f = values(data, 'http_req_failed{name:main}');
    const c = values(data, 'checks');
    const ok = allThresholdsOk(data) && (verdict ? verdict(data) : true);
    const obs = notes ? notes(data) : '';
    const errors = typeof f.rate === 'number' ? `${(f.rate * 100).toFixed(2)} %` : '-';
    const checks = typeof c.rate === 'number' ? `${(c.rate * 100).toFixed(1)} %` : '-';

    const row = `| ${id} | ${description} | ${r.count || 0} | ${fmt(r.rate)} | ${fmt(d.med)} | ${fmt(d['p(95)'])} | ${fmt(d['p(99)'])} | ${errors} | ${checks} | ${ok ? '✅ Cumple' : '❌ No cumple'} | ${obs} |\n`;

    const failed = failedThresholds(data);
    const text = [
      '',
      `==== ${id}: ${description} ====`,
      `  Peticiones medidas : ${r.count || 0} (${fmt(r.rate)} req/s)`,
      `  Tiempo (ms)        : mediana ${fmt(d.med)} | p95 ${fmt(d['p(95)'])} | p99 ${fmt(d['p(99)'])} | máx ${fmt(d.max)}`,
      `  Errores            : ${errors}   Checks OK: ${checks}`,
      obs ? `  Observaciones      : ${obs}` : '',
      `  Resultado          : ${ok ? 'CUMPLE' : 'NO CUMPLE'}${failed.length ? ` (falló: ${failed.join('; ')})` : ''}`,
      '',
    ].filter(Boolean).join('\n');

    return {
      stdout: `${text}\n`,
      [`resultados/${id}.json`]: JSON.stringify(data, null, 2),
      [`resultados/${id}.md`]: row,
    };
  };
}
