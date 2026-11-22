// Utilidades compartidas por las 15 pruebas de rendimiento de Andrés (k6).
// Base común igual a la de perf/mariana, más ayudas para productos, proveedores y órdenes.
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

// ---------------------------------------------------------------------------
// Ayudas para los servicios de Andrés: productos y proveedores REALES (ms-purchases
// valida por REST que existan), órdenes de compra y devoluciones.
// ---------------------------------------------------------------------------

// Identificador corto de la ejecución: hace únicos los SKU, códigos de barras y NIT.
export function runId() {
  return String(Date.now() % 1000000).padStart(6, '0');
}

const pad = (n, size) => String(n).padStart(size, '0');

// Dígito de verificación del NIT (algoritmo DIAN), para crear proveedores válidos.
export function nitWithCheckDigit(number) {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const sum = String(number).split('').reverse().reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
  const r = sum % 11;
  return `${number}-${r > 1 ? 11 - r : r}`;
}

export function categoryId(token) {
  const res = http.get(`${API}/categories`, params(token, 'setup'));
  if (res.status !== 200) fail(`No se pudieron consultar las categorías (${res.status})`);
  return res.json()[0].id;
}

// Cuerpo de un producto único: SKU PERF-<run>-<n> y código de barras de 13 dígitos.
export function productBody(run, n, catId) {
  return {
    sku: `PERF-${run}-${n}`,
    barcode: `77${run}${pad(n, 5)}`,
    name: `Producto de prueba ${run}-${n}`,
    categoryId: catId,
    basePrice: 100000 + n,
    unit: 'UND',
    specs: [{ key: 'Lote', value: `PERF-${run}` }],
  };
}

export function createProduct(token, run, n, catId, name) {
  return http.post(`${API}/products`, JSON.stringify(productBody(run, n, catId)), params(token, name || 'setup'));
}

export function seedCatalog(token, run, count) {
  const catId = categoryId(token);
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const res = createProduct(token, run, i, catId);
    if (res.status !== 201) fail(`No se pudo crear el producto (${res.status}): ${res.body}`);
    ids.push(res.json('id'));
  }
  return ids;
}

// Cuerpo de un proveedor único con NIT válido de 12 dígitos: 8<run><n>-DV.
export function supplierBody(run, n) {
  return {
    nit: nitWithCheckDigit(`8${run}${pad(n, 5)}`),
    businessName: `Proveedor de prueba ${run}-${n}`,
    email: `ventas.${run}.${n}@proveedor.co`,
    paymentTerms: 'Crédito 30 días',
    leadTimeDays: 5,
  };
}

export function createSupplier(token, run, n, name) {
  return http.post(`${API}/suppliers`, JSON.stringify(supplierBody(run, n)), params(token, name || 'setup'));
}

export function seedSuppliers(token, run, count) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const res = createSupplier(token, run, i);
    if (res.status !== 201) fail(`No se pudo crear el proveedor (${res.status}): ${res.body}`);
    ids.push(res.json('id'));
  }
  return ids;
}

export function createOrder(token, supplierId, productId, quantity, name, warehouseId) {
  return http.post(`${API}/purchases/orders`, JSON.stringify({
    supplierId,
    destinationWarehouseId: warehouseId || BOD_B,
    items: [{ productId, quantity, unitCost: 95000 }],
  }), params(token, name || 'setup'));
}

export function orderAction(token, orderId, action, name) {
  return http.post(`${API}/purchases/orders/${orderId}/${action}`, null, params(token, name || 'setup'));
}

// Orden creada y aprobada, lista para recibir. Devuelve su id.
export function approvedOrder(token, supplierId, productId, quantity, warehouseId) {
  const created = createOrder(token, supplierId, productId, quantity, 'setup', warehouseId);
  if (created.status !== 201) fail(`No se pudo crear la orden (${created.status}): ${created.body}`);
  const approved = orderAction(token, created.json('id'), 'approve');
  if (approved.status !== 200) fail(`No se pudo aprobar la orden (${approved.status}): ${approved.body}`);
  return created.json('id');
}

export function unitsIn(token, productId, warehouseId) {
  const stock = productStock(token, productId);
  return stock.warehouses.find((w) => w.warehouseId === warehouseId).quantity;
}
