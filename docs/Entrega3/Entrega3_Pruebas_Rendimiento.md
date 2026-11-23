# ENTREGA 3: PRUEBAS DE RENDIMIENTO

**Asignatura:** Ingeniería de Software II
**Proyecto:** Sistema de Gestión de Inventarios - LogiTech Solutions S.A.S.
**Equipo / Integrantes:** Mariana Duque Giraldo, Andrés Felipe Gálvez Carmona
**Entrega N.°:** 3

---

## 1. Resumen

| Integrante | Pruebas | Cumplen | No cumplen | Fecha de ejecución |
| --- | --- | --- | --- | --- |
| Mariana Duque Giraldo | 15 (M01–M15) | 14 | 1 (M02) | 22/11/2026 18:28 |
| Andrés Felipe Gálvez Carmona | 15 (A01–A15) | 14 | 1 (A10) | 22/11/2026 19:12 |
| **Total** | **30** | **28** | **2** | |

- **Herramienta:** k6 (imagen oficial `grafana/k6:0.54.0`).
- **Entorno:** Docker Compose sobre Ubuntu (Linux 7.0.0-42-generic).
- Todas las peticiones pasan por el **API Gateway**, salvo la medición directa de comparación en M04.
- Las 30 pruebas terminaron con **0.00 % de errores** y **100 % de checks correctos**.
- Los dos casos "No cumple" son de **tiempo de respuesta**, no de funcionamiento. Se analizan en la sección 6.

---

## 2. Dónde están las pruebas

Todas las pruebas de rendimiento están en el directorio **`perf/`** del repositorio, una carpeta por integrante:

```text
perf/
├── mariana/                          # 15 pruebas: API Gateway, ms-auth-users, ms-inventory-stock
│   ├── README.md                     # cómo ejecutarlas y criterio de cada prueba
│   ├── run-all.sh                    # ejecuta las 15 y genera la tabla de resultados
│   ├── lib/common.js                 # utilidades comunes (login, datos de prueba, resumen)
│   ├── M01-login-base.js … M15-resiliencia-broker.js
│   └── resultados/
│       ├── RESULTADOS.md             # tabla de resultados (sección 4)
│       └── M01.json … M15.json       # métricas completas de k6 por prueba
└── andres/                           # 15 pruebas: ms-products, ms-suppliers, ms-purchases, ms-returns-audit
    ├── README.md
    ├── run-all.sh
    ├── lib/common.js
    ├── A01-listado-productos.js … A15-caida-auditoria.js
    └── resultados/
        ├── RESULTADOS.md             # tabla de resultados (sección 5)
        └── A01.json … A15.json
```

Cada script `.js` explica en su encabezado qué simula, qué requisito (RF/RNF) evalúa y cuál es su criterio de aceptación.

La prueba funcional del flujo completo (no de rendimiento) está en `scripts/prueba-flujo-completo.sh`.

---

## 3. Cómo se ejecutan

k6 no se instala: corre con su imagen de Docker, conectado a la red interna de Docker Compose. Desde la raíz del repositorio, con el entorno levantado:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

```bash
bash perf/mariana/run-all.sh
```

```bash
bash perf/andres/run-all.sh
```

**Condiciones de ejecución**

- **Rate limit del gateway:** todas las pruebas salen de una sola IP, así que `run-all.sh` sube temporalmente el límite de peticiones del gateway. M11 es la excepción: mide justamente el límite normal de 600 peticiones por minuto.
- **Fallos programados:** en M15 el script apaga y enciende RabbitMQ automáticamente, y en A15 hace lo mismo con ms-returns-audit.
- **Qué se mide:** en cada prueba solo se cuenta la petición principal (etiqueta `name=main`). El login y la preparación de datos no afectan los resultados.

---

## 4. Resultados — Mariana Duque Giraldo

**Servicios evaluados:** API Gateway (Laravel), ms-auth-users y ms-inventory-stock, incluida su mensajería con RabbitMQ.
Fecha: 2026-11-22 18:28. Tiempos en milisegundos.

| ID | Escenario | Peticiones | Req/s | Mediana | p95 | p99 | Errores | Checks | Resultado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | Login, carga base (20 VUs, 1 min) | 866 | 14.2 | 345.1 | 495.4 | 3080.3 | 0.00 % | 100.0 % | ✅ Cumple | |
| M02 | Login en pico (rampa 0 → 100 VUs, 2 min) | 1683 | 13.9 | 3272.1 | 5529.4 | 5646.7 | 0.00 % | 100.0 % | ❌ No cumple | |
| M03 | Refresh de token con rotación (30 VUs, 1 min) | 1674 | 27.4 | 25.5 | 175.2 | 1052.5 | 0.00 % | 100.0 % | ✅ Cumple | |
| M04 | Sobrecosto del gateway: GET /stock directo vs. gateway (20 VUs c/u) | 2289 | 18.1 | 16.2 | 23.0 | 30.3 | 0.00 % | 100.0 % | ✅ Cumple | p95 directo 5.7 ms; diferencia 17.3 ms (máx. 50) |
| M05 | Consulta de saldos GET /stock (50 VUs, 2 min) — RNF06 | 5872 | 48.0 | 13.2 | 27.9 | 58.3 | 0.00 % | 100.0 % | ✅ Cumple | |
| M06 | Saldo por producto GET /stock/{id} (100 VUs, 2 min) | 11712 | 95.8 | 12.3 | 23.2 | 41.5 | 0.00 % | 100.0 % | ✅ Cumple | |
| M07 | Estrés de GET /stock/{id} (rampa 50 → 300 VUs, 6.5 min) | 84835 | 216.7 | 11.7 | 23.1 | 47.2 | 0.00 % | 100.0 % | ✅ Cumple | p95 por nivel → 50 VUs: 20 ms · 100 VUs: 20 ms · 150 VUs: 21 ms · 200 VUs: 24 ms · 250 VUs: 26 ms · 300 VUs: 25 ms. No se alcanzó el punto de quiebre hasta 300 VUs |
| M08 | Salidas concurrentes: 300 intentos sobre 100 unidades (50 VUs) | 300 | 348.2 | 98.5 | 189.5 | 219.1 | 0.00 % | 100.0 % | ✅ Cumple | 100 aceptadas, 200 rechazadas por saldo insuficiente (esperado 100 / 200) |
| M09 | Transferencias concurrentes A ↔ B (30 VUs, 1 min) | 8123 | 134.6 | 17.5 | 41.2 | 78.6 | 0.00 % | 100.0 % | ✅ Cumple | Suma A + B constante (1000) y sin saldos negativos |
| M10 | Alertas de stock bajo GET /stock/alerts (50 VUs, 1 min) | 3000 | 48.5 | 13.1 | 23.4 | 47.6 | 0.00 % | 100.0 % | ✅ Cumple | |
| M11 | Rate limiting: 20 req/s durante 60 s desde una IP (límite 600/min) | 1201 | 20.0 | 11.8 | 17.7 | 19.8 | 0.00 % | 100.0 % | ✅ Cumple | 607 atendidas y 594 limitadas con 429 |
| M12 | Rechazo de JWT ausente, mal formado o alterado (100 VUs, 1 min) | 11357 | 187.4 | 10.8 | 26.8 | 62.5 | 0.00 % | 100.0 % | ✅ Cumple | |
| M13 | Soak: uso mixto del inventario (30 VUs, 10 min) | 17734 | 29.4 | 13.8 | 22.8 | 28.2 | 0.00 % | 100.0 % | ✅ Cumple | p95 primeros 2 min 24.7 ms vs. últimos 2 min 22.8 ms (×0.92, máx. ×1.5) |
| M14 | Mensajería: 200 purchase.received (+200 duplicados) hasta verse en stock | 400 | 88.2 | 3.1 | 4.2 | 7.3 | 0.00 % | 100.0 % | ✅ Cumple | Stock final 200 (esperado 200); todos aplicados en 1.4 s. Los tiempos de la tabla son los de publicar en RabbitMQ |
| M15 | Caída de RabbitMQ durante la carga: movimientos (30 VUs, 90 s; broker apagado ~30–60 s) | 5216 | 57.4 | 16.6 | 29.5 | 39.0 | 0.00 % | 100.0 % | ✅ Cumple | p95 antes: 30.8 ms · p95 sin broker: 29.4 ms · p95 después: 28.1 ms |

Tras M15, el outbox de ms-inventory-stock quedó con **0 eventos pendientes**: todo lo acumulado sin broker se publicó al volver RabbitMQ.

### Análisis

- **RNF06 (95 % de las consultas de stock en menos de 2 s): se cumple con amplio margen.** El p95 de las consultas de saldos (M05, M06, M10) está entre 23 y 28 ms, unas 70 veces por debajo del límite.
- **Escalabilidad (M07):** con 300 usuarios simultáneos el p95 solo pasó de 20 a 25 ms, a 217 req/s. No se encontró un punto de quiebre en el rango probado.
- **Integridad bajo concurrencia (M08, M09):** las salidas simultáneas aceptaron exactamente las 100 unidades disponibles y el saldo nunca fue negativo. Las transferencias cruzadas conservaron la suma total (1000) sin deadlocks.
- **Costo del gateway (M04):** pasar por el API Gateway en Laravel agrega 17.3 ms al p95, por debajo del máximo de 50 ms.
- **Seguridad (M11, M12):** el rate limiting atendió unas 600 peticiones por minuto y limitó el resto con 429. Los tokens inválidos se rechazan en 26.8 ms (p95), sin llegar a los microservicios.
- **Resistencia (M13):** después de 10 minutos de uso continuo el p95 no se degradó (×0.92): no hay fugas de memoria ni de conexiones.
- **Mensajería y tolerancia a fallas (M14, M15):** 200 eventos se aplicaron en 1.4 s sin duplicados. Con RabbitMQ apagado el inventario siguió respondiendo con 0 % de errores (RNF09).
- **M02 (No cumple):** ver la sección 6.

---

## 5. Resultados — Andrés Felipe Gálvez Carmona

**Servicios evaluados:** ms-products, ms-suppliers, ms-purchases y ms-returns-audit, siempre a través del API Gateway.
Fecha: 2026-11-22 19:12. Tiempos en milisegundos.

| ID | Escenario | Peticiones | Req/s | Mediana | p95 | p99 | Errores | Checks | Resultado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | Listado de productos GET /products (50 VUs, 2 min) | 5738 | 47.2 | 13.5 | 25.6 | 60.3 | 0.00 % | 100.0 % | ✅ Cumple | |
| A02 | Búsqueda de productos GET /products?q= (50 VUs, 2 min) | 5950 | 48.9 | 12.8 | 23.7 | 41.4 | 0.00 % | 100.0 % | ✅ Cumple | |
| A03 | Creación concurrente con SKU duplicado (20 VUs x 5 rondas) | 100 | 336.9 | 37.2 | 49.4 | 60.7 | 0.00 % | 100.0 % | ✅ Cumple | 5 creados y 95 rechazados con 409 (esperado 5 / 95) |
| A04 | Detalle de producto GET /products/{id} (100 VUs, 1 min) | 5761 | 93.4 | 13.4 | 27.9 | 73.8 | 0.00 % | 100.0 % | ✅ Cumple | |
| A05 | Directorio de proveedores GET /suppliers (50 VUs, 1 min) | 2968 | 48.2 | 13.0 | 24.0 | 109.9 | 0.00 % | 100.0 % | ✅ Cumple | |
| A06 | Creación de proveedores con contacto (20 VUs, 1 min) | 2320 | 38.4 | 18.0 | 29.8 | 38.5 | 0.00 % | 100.0 % | ✅ Cumple | |
| A07 | Crear órdenes de compra con validación REST (30 VUs, 2 min) | 3508 | 28.9 | 26.0 | 46.2 | 104.9 | 0.00 % | 100.0 % | ✅ Cumple | |
| A08 | Aprobar órdenes de compra (20 VUs, 1 min) | 2138 | 35.2 | 24.5 | 44.7 | 55.5 | 0.00 % | 100.0 % | ✅ Cumple | |
| A09 | Recepción de órdenes hasta verse en stock (10 VUs, 1 min) | 300 | 5.0 | 19.8 | 31.7 | 36.2 | 0.00 % | 100.0 % | ✅ Cumple | Latencia de extremo a extremo (compras → RabbitMQ → stock): mediana 930 ms, p95 979 ms |
| A10 | Ráfaga: 100 recepciones simultáneas (50 VUs) | 100 | 11.8 | 42.0 | 4602.0 | 5185.5 | 0.00 % | 100.0 % | ❌ No cumple | Stock final 100 (esperado 100); los eventos pendientes se aplicaron 0.5 s después de terminar la ráfaga |
| A11 | Consulta del Kardex con filtros (50 VUs, 2 min) | 5881 | 47.2 | 18.9 | 31.9 | 44.7 | 0.00 % | 100.0 % | ✅ Cumple | |
| A12 | Verificación de la cadena del Kardex mientras se registran movimientos (3 + 10 VUs, 1 min) | 117 | 1.9 | 534.0 | 782.7 | 804.5 | 0.00 % | 100.0 % | ✅ Cumple | 100 % de las verificaciones reportaron la cadena íntegra |
| A13 | Registro de devoluciones RESTOCK + DAMAGED (20 VUs, 1 min) | 2300 | 37.8 | 19.3 | 37.1 | 105.5 | 0.00 % | 100.0 % | ✅ Cumple | 2300 devoluciones registradas; cada una reingresó 1 unidad a BOD-A por evento |
| A14 | Métricas del dashboard (50 VUs, 1 min) | 2691 | 44.2 | 51.0 | 82.3 | 3560.1 | 0.00 % | 100.0 % | ✅ Cumple | |
| A15 | Caída de ms-returns-audit durante la carga (20 VUs, 90 s; auditoría apagada ~30–60 s) | 3480 | 37.4 | 17.9 | 27.8 | 35.3 | 0.00 % | 100.0 % | ✅ Cumple | p95 antes: 29.8 ms · p95 sin auditoría: 26.2 ms · p95 después: 26.5 ms. Movimientos faltantes en el Kardex tras volver: 0 |

### Análisis

- **Catálogo y proveedores (A01, A02, A04, A05, A06):** p95 entre 24 y 30 ms con hasta 100 usuarios. La búsqueda por texto (A02) no es más lenta que el listado.
- **Unicidad bajo concurrencia (A03):** con 20 usuarios creando el mismo SKU a la vez, PostgreSQL dejó crear exactamente uno por ronda (5 de 100) y el resto recibió 409, sin ningún error 500.
- **Comunicación síncrona (A07):** crear una orden incluye las consultas REST a ms-suppliers y ms-products. Aun así el p95 es de 46.2 ms, frente a 24.5 ms de una aprobación (A08), que no consulta otros servicios. Esa diferencia, de unos 20 ms, es el costo de la validación REST.
- **RF10 de extremo a extremo (A09):** desde que el operario confirma la recepción hasta que las unidades aparecen en stock pasan unos 0.93 s (mediana), recorriendo outbox, RabbitMQ y consumidor. El p95 es de 979 ms, por debajo del criterio de 3 s.
  - Ese tiempo lo domina el intervalo de 1 s con el que el outbox revisa si hay eventos nuevos (`OUTBOX_INTERVAL_MS`). Es configurable si se necesita menor latencia.
- **Integridad del Kardex (A12, A15):** las 117 verificaciones de la cadena de hashes reportaron el Kardex íntegro mientras se escribían movimientos nuevos.
  - Con ms-returns-audit apagado 30 s, el inventario siguió funcionando y, al volver, el Kardex tenía todos los movimientos: **0 faltantes**. Esto confirma lo que establece la Entrega 2 (§1.5) para RNF09.
- **Devoluciones (A13):** 2300 devoluciones, cada una reingresó exactamente 1 unidad a BOD-A mediante el evento `return.processed`.
- **Dashboard (A14):** p95 de 82.3 ms. El máximo aislado de 3.5 s ocurrió al inicio de la prueba (ver la sección 6).
- **A10 (No cumple):** ver la sección 6.

---

## 6. Hallazgos y mejoras propuestas

### M02: el login es el cuello de botella (limitado por CPU)

- **Qué se observó:** en M01 y M02 el sistema atendió como máximo unos **14 logins por segundo** (14.2 y 13.9 req/s), sin importar si había 20 o 100 usuarios. Con 100 usuarios la fila de espera llevó el p95 a 5.5 s.
- **Causa:** verificar una contraseña con bcrypt es lento a propósito (unos 70 ms), como protección contra ataques de fuerza bruta. La librería usada (`bcryptjs`) está escrita en JavaScript y ocupa el único hilo de Node.js mientras calcula, así que los logins se atienden de uno en uno.
- **El resto del sistema no se ve afectado:** las operaciones que no hacen login, incluido el refresh de token (M03), responden en milisegundos.
- **Mejoras propuestas:**
  - Usar la versión nativa `bcrypt`, que calcula en varios hilos en paralelo.
  - Ejecutar varias réplicas de ms-auth-users, con autoescalado (HPA) en Kubernetes, que es la próxima entrega.

### A10: retraso inicial en la ráfaga de recepciones

- **Qué se observó:** la mediana fue de 42 ms, pero el p95 llegó a 4.6 s. **El resultado funcional fue correcto:** stock final exactamente 100, sin eventos perdidos ni duplicados, y los pendientes se aplicaron 0.5 s después de terminar la ráfaga.
- **Causa probable:** A10 envía sus 100 peticiones todas al comienzo, con 50 usuarios a la vez, así que coincide con el arranque del gateway. Apache inicia con pocos procesos y crea más de forma gradual, y las primeras peticiones esperan en fila.
  - El mismo efecto aparece como máximos aislados de 3 a 5 s al inicio de otras pruebas (por ejemplo, el máximo de A14 o el p99 de M01), mientras su mediana y su p95 son bajos.
  - En las pruebas largas ese arranque se diluye; en A10, que dura solo unos segundos, domina el p95.
- **Mejora propuesta:** configurar Apache para que arranque con más procesos disponibles (`StartServers` y `MinSpareServers` del módulo `mpm_prefork`) y repetir A10 para confirmarlo.

### Conclusión preliminar

El sistema cumple los requisitos de rendimiento y tolerancia a fallas evaluados en esta fase:
- **RNF06:** consultas de stock muy por debajo de 2 s.
- **RNF08:** mensajería asíncrona sin pérdidas ni duplicados.
- **RNF09:** el inventario sigue operando si caen RabbitMQ o la auditoría.
- **RNF12:** el Kardex permanece íntegro bajo carga.

Los dos puntos a mejorar están identificados (la capacidad del login y el arranque del gateway) y tienen soluciones concretas para la siguiente fase.
