# Plan de Pruebas de Rendimiento

**Proyecto:** Sistema de Gestión de Inventarios - LogiTech Solutions S.A.S.
**Integrantes:** Mariana Duque Giraldo, Andrés Felipe Gálvez Carmona
**Requisito de la fase:** 15 pruebas de rendimiento por integrante (30 en total).

---

## 1. Herramientas y entorno

| Elemento | Propuesta |
| --- | --- |
| Generador de carga | **k6** (scripts en JavaScript, fácil de versionar en GitHub). Alternativas: Apache JMeter o Locust. |
| Entorno | Clúster local (minikube o kind) con los manifiestos de `k8s/`. |
| Monitoreo | `kubectl top pods`, consola de RabbitMQ (puerto 15672) y, opcional, Prometheus + Grafana. |
| Datos de prueba | 5.000 productos, saldos en ambas bodegas y 20 usuarios (7 administradores, 10 operarios, 3 auditores). |
| Ejecución | Cada prueba se repite **3 veces**; se reporta la mediana. |

**Métricas a registrar en todas las pruebas:** latencia p50 / p95 / p99, peticiones por segundo, porcentaje de errores y consumo de CPU/memoria de los pods involucrados.

**Perfiles de carga usados en las tablas:**

| Código | Perfil |
| --- | --- |
| **Base** | 10 usuarios virtuales (VU), 2 min |
| **Normal** | 50 VU, 5 min |
| **Pico** | 200 VU, 5 min |
| **Estrés** | Subida progresiva de 50 a 500 VU hasta encontrar el punto de quiebre |
| **Resistencia** | 50 VU, 30 min |

> Los valores objetivo de las tablas son un **punto de partida razonable**, no resultados. Solo RNF06 (p95 < 2.0 s en consultas de stock) viene de sus requerimientos; el resto debe ajustarlo el equipo tras una primera ejecución.

---

## 2. Reparto entre integrantes

| Integrante | Foco | Servicios |
| --- | --- | --- |
| **Mariana Duque Giraldo** | Entrada del sistema y datos maestros | API Gateway, ms-auth-users, ms-products, ms-suppliers |
| **Andrés Felipe Gálvez Carmona** | Núcleo transaccional y mensajería | ms-inventory-stock, ms-purchases, ms-returns-audit, RabbitMQ, Kubernetes |

---

## 3. Pruebas de Mariana Duque Giraldo (PM-01 a PM-15)

| ID | Servicio | Escenario | Perfil | Métrica y criterio de aceptación | Req. |
| --- | --- | --- | --- | --- | --- |
| PM-01 | ms-auth-users | Login con credenciales válidas | Normal | p95 < 800 ms; 0 % de errores | RF01 |
| PM-02 | ms-auth-users | Login simultáneo de 200 usuarios | Pico | p95 < 2.0 s; errores < 1 % | RF01 |
| PM-03 | ms-auth-users | Intentos de login con credenciales inválidas (fuerza bruta simulada) | Pico | El servicio responde 401 sin degradarse; p95 < 1 s | RNF07 |
| PM-04 | API Gateway | Validación de JWT en cada petición (ruta protegida simple) | Normal | Sobrecarga del Gateway < 50 ms sobre el servicio destino | RNF05, RNF07 |
| PM-05 | API Gateway | Rechazo de tokens inválidos o vencidos | Pico | 100 % responde 401/403; p95 < 300 ms | RNF07 |
| PM-06 | API Gateway | Enrutamiento mixto a los 6 servicios | Pico | Throughput estable; errores < 1 % | RNF05 |
| PM-07 | API Gateway | Límite de peticiones (*rate limiting*) | Estrés | Responde 429 al exceder el umbral y se recupera sin reiniciar | RNF05 |
| PM-08 | ms-products | Consulta de catálogo paginada (5.000 productos) | Normal | p95 < 1.0 s | RF02 |
| PM-09 | ms-products | Búsqueda por SKU y código de barras | Pico | p95 < 500 ms (índice único) | RF02 |
| PM-10 | ms-products | Búsqueda por nombre con filtro de categoría | Normal | p95 < 1.5 s | RF02 |
| PM-11 | ms-products | Creación concurrente de productos con SKU duplicado | Normal | Solo una creación exitosa; el resto 409; 0 duplicados en la BD | RF02, RNF02 |
| PM-12 | ms-suppliers | Consulta y búsqueda de proveedores | Normal | p95 < 1.0 s | RF08 |
| PM-13 | ms-suppliers | Alta y edición de proveedores bajo carga | Normal | p95 < 1.5 s; errores < 1 % | RF08 |
| PM-14 | Gateway + auth | Aislamiento de fallas: apagar `ms-suppliers` durante carga de login y catálogo | Normal | Login y catálogo mantienen errores < 1 % | RNF09 |
| PM-15 | Gateway + auth + products | Prueba de resistencia de 30 minutos con flujo mixto | Resistencia | Sin crecimiento sostenido de memoria; p95 estable | RNF06 |

---

## 4. Pruebas de Andrés Felipe Gálvez Carmona (PA-01 a PA-15)

| ID | Servicio | Escenario | Perfil | Métrica y criterio de aceptación | Req. |
| --- | --- | --- | --- | --- | --- |
| PA-01 | ms-inventory-stock | Consulta de disponibilidad de un producto en ambas bodegas | Normal | **p95 < 2.0 s** | RNF06, RF03 |
| PA-02 | ms-inventory-stock | Misma consulta con alta demanda | Pico | **p95 < 2.0 s**; errores < 1 % | RNF06 |
| PA-03 | ms-inventory-stock | Listado de saldos paginado de toda la bodega | Normal | p95 < 2.0 s | RF03 |
| PA-04 | ms-inventory-stock | Salidas concurrentes sobre un mismo producto con saldo limitado | Pico | El saldo final **nunca es negativo**; el exceso responde 409 | RF04 |
| PA-05 | ms-inventory-stock | Entradas y salidas simultáneas del mismo producto (bloqueo optimista) | Pico | Saldo final = saldo inicial + entradas − salidas; sin pérdidas de actualización | RF04 |
| PA-06 | ms-inventory-stock | Transferencias concurrentes Bodega A → B | Pico | Suma de ambas bodegas constante; ninguna transferencia parcial | RF05 |
| PA-07 | ms-inventory-stock | Cálculo de alertas de stock bajo con 5.000 productos | Normal | p95 < 2.0 s | RF06 |
| PA-08 | ms-purchases | Creación de órdenes de compra concurrentes | Normal | p95 < 1.5 s; numeración única sin repetidos | RF09 |
| PA-09 | ms-purchases | Recepción de 100 órdenes en 1 minuto | Pico | Respuesta al usuario < 1 s (la actualización de stock es asíncrona) | RF10 |
| PA-10 | RabbitMQ + stock | Latencia de extremo a extremo: `purchase.received` hasta el saldo actualizado | Normal | Mediana < 3 s; ningún evento perdido | RF10, RNF08 |
| PA-11 | RabbitMQ + audit | Ráfaga de 5.000 eventos `stock.movement.created` | Pico | Los 5.000 quedan en el Kardex; cola vacía en < 2 min; sin duplicados | RF07, RNF08 |
| PA-12 | ms-returns-audit | Consulta del Kardex con filtros (producto, fechas, bodega) sobre 500.000 registros | Normal | p95 < 2.0 s | RF07 |
| PA-13 | ms-returns-audit | Intento de `UPDATE` / `DELETE` directo sobre el Kardex | Base | 100 % rechazado por la BD | RNF12 |
| PA-14 | Kubernetes | Autoescalado (HPA) de `ms-inventory-stock` bajo carga creciente | Estrés | Pasa de 2 a más réplicas al superar 70 % de CPU y mantiene p95 < 2.0 s | RNF10, RNF06 |
| PA-15 | RabbitMQ + audit | Resiliencia: apagar `ms-returns-audit` 2 min con carga de movimientos y volver a encenderlo | Normal | Stock sigue respondiendo; al volver, el Kardex recupera todos los movimientos | RNF08, RNF09 |

---

## 5. Cobertura de requerimientos no funcionales

| RNF | Pruebas que lo verifican |
| --- | --- |
| RNF05 (API Gateway) | PM-04, PM-06, PM-07 |
| RNF06 (< 2.0 s) | PA-01, PA-02, PA-03, PA-07, PA-12, PA-14, PM-15 |
| RNF07 (JWT) | PM-03, PM-04, PM-05 |
| RNF08 (RabbitMQ) | PA-10, PA-11, PA-15 |
| RNF09 (aislamiento de fallas) | PM-14, PA-15 |
| RNF10 (HPA) | PA-14 |
| RNF12 (Kardex inalterable) | PA-13 |
| RNF02 (BD independiente) | PM-11 |

## 6. Plantilla de registro de resultados

| ID | Fecha | Ejecutor | VU | Duración | p50 | p95 | p99 | Req/s | % Errores | CPU máx. | Mem. máx. | ¿Cumple? | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PA-01 | | | | | | | | | | | | | |

## 7. Ejemplo de script k6 (PA-01)

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '4m',  target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],   // RNF06
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:8080/api/v1';

export function setup() {
  const res = http.post(`${BASE}/auth/login`,
    JSON.stringify({ email: 'operario@logitech.test', password: 'Clave123!' }),
    { headers: { 'Content-Type': 'application/json' } });
  return { token: res.json('accessToken') };
}

export default function (data) {
  const productId = __ENV.PRODUCT_ID;
  const res = http.get(`${BASE}/stock/${productId}`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1);
}
```

Ejecución: `k6 run -e BASE_URL=http://logitech.local/api/v1 -e PRODUCT_ID=<uuid> pa-01.js`
