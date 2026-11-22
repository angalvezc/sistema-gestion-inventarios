// Prueba del flujo completo del sistema, SIEMPRE a través del API Gateway.
// La ejecuta scripts/prueba-flujo-completo.sh dentro de un contenedor node:20-alpine
// conectado a la red de Docker Compose. No usa librerías: solo fetch (Node 20).
//
// Recorre: usuarios y roles -> catálogo y proveedor -> orden de compra -> recepción
// (evento a stock) -> transferencia -> alerta de stock bajo -> devolución (evento a
// stock) -> Kardex (eventos de stock) -> verificación de la cadena -> dashboard ->
// controles de seguridad del gateway.

const API = process.env.GATEWAY_URL || 'http://api-gateway:8080/api/v1';
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
const BOD_A = 1; // Manizales
const BOD_B = 2; // Medellín

const results = [];
const run = Date.now().toString().slice(-8); // sufijo único para no chocar con datos anteriores

// ---------------- utilidades ----------------
async function call(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${!ok && detail !== undefined ? `\n     → ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  return ok;
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

// Espera a que una condición se cumpla (los eventos de RabbitMQ tardan unos milisegundos).
async function waitFor(fn, condition, timeoutMs = 15000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (condition(last)) return last;
    await new Promise((r) => setTimeout(r, 300));
  }
  return last;
}

// Dígito de verificación del NIT (algoritmo DIAN), para crear un proveedor válido.
function nitWithCheckDigit(number) {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const sum = String(number).split('').reverse().reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
  const r = sum % 11;
  return `${number}-${r > 1 ? 11 - r : r}`;
}

async function login(credentials) {
  const res = await call('POST', '/auth/login', { body: credentials });
  return res.status === 200 ? res.body.accessToken : null;
}

const stockOf = async (token, productId) => {
  const res = await call('GET', `/stock/${productId}`, { token });
  const [a, b] = res.body.warehouses;
  return { a: a.quantity, b: b.quantity, aStatus: a.status };
};

// ---------------- flujo ----------------
async function main() {
  if (!ADMIN.email || !ADMIN.password) throw new Error('Faltan ADMIN_EMAIL / ADMIN_PASSWORD');

  section('1. Usuarios y roles (RF01)');
  const admin = await login(ADMIN);
  if (!check('ADMIN inicia sesión y recibe un JWT', Boolean(admin))) throw new Error('Sin login de ADMIN no se puede continuar');
  const password = `Prueba-${run}`;
  const opUser = await call('POST', '/users', { token: admin, body: { email: `operario.${run}@logitech.com`, password, fullName: 'Operario de prueba', role: 'WAREHOUSE_OPERATOR' } });
  const audUser = await call('POST', '/users', { token: admin, body: { email: `auditor.${run}@logitech.com`, password, fullName: 'Auditor de prueba', role: 'AUDITOR' } });
  check('ADMIN crea un operario de bodega y un auditor', opUser.status === 201 && audUser.status === 201, [opUser.body, audUser.body]);
  const operator = await login({ email: `operario.${run}@logitech.com`, password });
  const auditor = await login({ email: `auditor.${run}@logitech.com`, password });
  check('el operario y el auditor inician sesión', Boolean(operator && auditor));

  section('2. Catálogo y proveedor (RF02, RF08)');
  const categories = await call('GET', '/categories', { token: admin });
  const computers = (categories.body || []).find((c) => c.name === 'Computadores');
  const sku = `E2E-${run}`;
  const product = await call('POST', '/products', { token: admin, body: {
    sku, barcode: `770${run}00`.slice(0, 13), name: `Portátil de prueba ${run}`, categoryId: computers.id,
    basePrice: 1500000, unit: 'UND', specs: [{ key: 'RAM', value: '16 GB' }],
  } });
  check(`ADMIN crea el producto ${sku}`, product.status === 201, product.body);
  const productId = product.body.id;
  const supplier = await call('POST', '/suppliers', { token: admin, body: {
    nit: nitWithCheckDigit(`9${run}`), businessName: `Proveedor de prueba ${run}`, email: `ventas.${run}@proveedor.co`,
    paymentTerms: 'Crédito 30 días', leadTimeDays: 3,
  } });
  check(`ADMIN crea el proveedor con NIT ${nitWithCheckDigit(`9${run}`)}`, supplier.status === 201, supplier.body);

  section('3. Orden de compra (RF09)');
  const order = await call('POST', '/purchases/orders', { token: admin, body: {
    supplierId: supplier.body.id, destinationWarehouseId: BOD_B, items: [{ productId, quantity: 20, unitCost: 1200000 }],
  } });
  check(`ADMIN crea la orden ${order.body && order.body.orderNumber} en DRAFT (total $24.000.000)`,
    order.status === 201 && order.body.status === 'DRAFT' && order.body.totalAmount === 24000000 && order.body.items[0].sku === sku, order.body);
  const orderId = order.body.id;
  const approved = await call('POST', `/purchases/orders/${orderId}/approve`, { token: admin });
  check('ADMIN aprueba la orden: DRAFT → APPROVED', approved.status === 200 && approved.body.status === 'APPROVED', approved.body);

  section('4. Recepción de mercancía (RF10, evento purchase.received)');
  const received = await call('POST', `/purchases/orders/${orderId}/receive`, { token: operator });
  check('el OPERARIO recibe la orden: APPROVED → RECEIVED', received.status === 200 && received.body.status === 'RECEIVED', received.body);
  let s = await waitFor(() => stockOf(operator, productId), (x) => x.b === 20);
  check('el stock de BOD-B (Medellín) sube a 20 por el evento', s.b === 20 && s.a === 0, s);

  section('5. Transferencia entre bodegas (RF05)');
  const transfer = await call('POST', '/stock/transfers', { token: operator, body: { productId, fromWarehouseId: BOD_B, toWarehouseId: BOD_A, quantity: 5 } });
  s = await stockOf(operator, productId);
  check('el OPERARIO transfiere 5 de Medellín a Manizales: A = 5, B = 15', transfer.status === 201 && s.a === 5 && s.b === 15, { transfer: transfer.body, s });

  section('6. Salida y alerta de stock bajo (RF04, RF06)');
  const threshold = await call('PUT', `/stock/${productId}/min-threshold`, { token: admin, body: { warehouseId: BOD_A, minThreshold: 4 } });
  check('ADMIN define un mínimo de 4 unidades en BOD-A', threshold.status === 200, threshold.body);
  const exit = await call('POST', '/stock/movements', { token: operator, body: { productId, warehouseId: BOD_A, type: 'EXIT', quantity: 2, reference: `PEDIDO-${run}` } });
  check('el OPERARIO despacha 2 unidades de BOD-A: queda en 3', exit.status === 201 && exit.body.balanceAfter === 3, exit.body);
  const tooMuch = await call('POST', '/stock/movements', { token: operator, body: { productId, warehouseId: BOD_A, type: 'EXIT', quantity: 50, reference: 'EXCESO' } });
  check('una salida mayor al saldo es rechazada (409): nunca queda negativo', tooMuch.status === 409 && tooMuch.body.code === 'INSUFFICIENT_STOCK', tooMuch.body);
  const alerts = await call('GET', '/stock/alerts?warehouseId=1', { token: operator });
  check('el producto aparece en las alertas como LOW (3 < 4)',
    alerts.status === 200 && alerts.body.some((x) => x.productId === productId && x.status === 'LOW'), alerts.body);

  section('7. Devolución (RF11, evento return.processed)');
  const ret = await call('POST', '/audit/returns', { token: operator, body: {
    origin: 'CLIENT', reason: 'Prueba de flujo completo',
    items: [
      { productId, quantity: 1, disposition: 'RESTOCK', warehouseId: BOD_A },
      { productId, quantity: 1, disposition: 'DAMAGED', warehouseId: BOD_B },
    ],
  } });
  check(`el OPERARIO registra la devolución ${ret.body && ret.body.returnNumber}`, ret.status === 201 && ret.body.status === 'PROCESSED', ret.body);
  s = await waitFor(() => stockOf(operator, productId), (x) => x.a === 4);
  check('la unidad RESTOCK vuelve a BOD-A (4) y la DAMAGED no suma en BOD-B (15)', s.a === 4 && s.b === 15, s);

  section('8. Kardex inalterable (RF07, eventos stock.movement.created)');
  const expected = ['ENTRY', 'TRANSFER_OUT', 'TRANSFER_IN', 'EXIT', 'RETURN_IN'];
  const kardex = await waitFor(
    () => call('GET', `/audit/kardex?productId=${productId}&size=50`, { token: auditor }),
    (k) => k.status === 200 && k.body.totalElements >= expected.length,
  );
  const types = kardex.status === 200 ? kardex.body.content.slice().reverse().map((k) => k.movementType) : [];
  check('el AUDITOR ve los 5 movimientos del producto, en orden', JSON.stringify(types) === JSON.stringify(expected), types);
  check(`cada registro del Kardex tiene el SKU ${sku} y un hash`,
    kardex.status === 200 && kardex.body.content.every((k) => k.skuSnapshot === sku && /^[0-9a-f]{64}$/.test(k.rowHash)), kardex.body);
  check('el Kardex registra quién hizo cada movimiento',
    kardex.status === 200 && kardex.body.content.some((k) => k.userEmail === `operario.${run}@logitech.com`), kardex.body);

  section('9. Integridad y dashboard (RNF12, RF12)');
  const verify = await call('GET', '/audit/kardex/verify', { token: auditor });
  check(`la cadena de hashes está íntegra (${verify.body && verify.body.checkedEntries} registros)`, verify.status === 200 && verify.body.valid === true, verify.body);
  const metrics = await call('GET', '/audit/dashboard/metrics', { token: auditor });
  check('el dashboard responde con valor del inventario, agotados y movimientos del día',
    metrics.status === 200 && metrics.body.inventoryValueAvailable === true && typeof metrics.body.movementsToday === 'number', metrics.body);

  section('10. Seguridad del API Gateway (RNF05, RNF07)');
  const audMove = await call('POST', '/stock/movements', { token: auditor, body: { productId, warehouseId: BOD_A, type: 'ENTRY', quantity: 1, reference: 'X' } });
  check('el AUDITOR no puede registrar movimientos (403)', audMove.status === 403, audMove.body);
  const opApprove = await call('POST', `/purchases/orders/${orderId}/approve`, { token: operator });
  check('el OPERARIO no puede aprobar órdenes (403)', opApprove.status === 403, opApprove.body);
  const opUsers = await call('GET', '/users', { token: operator });
  check('el OPERARIO no puede gestionar usuarios (403)', opUsers.status === 403, opUsers.body);
  const noToken = await call('GET', '/stock');
  check('sin token no se puede consultar el stock (401)', noToken.status === 401, noToken.body);
  const fakeToken = await call('GET', '/stock', { token: `${admin.slice(0, -5)}AAAAA` });
  check('un token alterado es rechazado (401)', fakeToken.status === 401, fakeToken.body);
  const internal = await call('GET', '/auth/validate', { token: admin });
  check('el endpoint interno /auth/validate no se expone (404)', internal.status === 404, internal.body);
}

main()
  .catch((err) => check(`la prueba no pudo continuar: ${err.message}`, false))
  .finally(() => {
    const ok = results.filter((r) => r.ok).length;
    console.log(`\n${'═'.repeat(64)}\nResultado dentro de la red: ${ok}/${results.length} pasos correctos\n${'═'.repeat(64)}`);
    process.exitCode = ok === results.length ? 0 : 1;
  });
