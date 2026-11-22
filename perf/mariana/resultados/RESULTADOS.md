# Resultados preliminares de rendimiento — Mariana Duque Giraldo

Fecha: 2026-11-22 18:28 · Herramienta: k6 (grafana/k6:0.54.0) · Entorno: Docker Compose en Linux 7.0.0-42-generic

Tiempos en milisegundos, medidos sobre la petición principal de cada prueba (sin login ni preparación de datos).

| ID | Escenario | Peticiones | Req/s | Mediana | p95 | p99 | Errores | Checks | Resultado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | Login, carga base (20 VUs, 1 min) | 866 | 14.2 | 345.1 | 495.4 | 3080.3 | 0.00 % | 100.0 % | ✅ Cumple |  |
| M02 | Login en pico (rampa 0 → 100 VUs, 2 min) | 1683 | 13.9 | 3272.1 | 5529.4 | 5646.7 | 0.00 % | 100.0 % | ❌ No cumple |  |
| M03 | Refresh de token con rotación (30 VUs, 1 min) | 1674 | 27.4 | 25.5 | 175.2 | 1052.5 | 0.00 % | 100.0 % | ✅ Cumple |  |
| M04 | Sobrecosto del gateway: GET /stock directo vs. gateway (20 VUs c/u) | 2289 | 18.1 | 16.2 | 23.0 | 30.3 | 0.00 % | 100.0 % | ✅ Cumple | p95 directo 5.7 ms; diferencia 17.3 ms (máx. 50) |
| M05 | Consulta de saldos GET /stock (50 VUs, 2 min) — RNF06 | 5872 | 48.0 | 13.2 | 27.9 | 58.3 | 0.00 % | 100.0 % | ✅ Cumple |  |
| M06 | Saldo por producto GET /stock/{id} (100 VUs, 2 min) | 11712 | 95.8 | 12.3 | 23.2 | 41.5 | 0.00 % | 100.0 % | ✅ Cumple |  |
| M07 | Estrés de GET /stock/{id} (rampa 50 → 300 VUs, 6.5 min) | 84835 | 216.7 | 11.7 | 23.1 | 47.2 | 0.00 % | 100.0 % | ✅ Cumple | p95 por nivel → 50 VUs: 20 ms · 100 VUs: 20 ms · 150 VUs: 21 ms · 200 VUs: 24 ms · 250 VUs: 26 ms · 300 VUs: 25 ms. No se alcanzó el punto de quiebre hasta 300 VUs |
| M08 | Salidas concurrentes: 300 intentos sobre 100 unidades (50 VUs) | 300 | 348.2 | 98.5 | 189.5 | 219.1 | 0.00 % | 100.0 % | ✅ Cumple | 100 aceptadas, 200 rechazadas por saldo insuficiente (esperado 100 / 200) |
| M09 | Transferencias concurrentes A ↔ B (30 VUs, 1 min) | 8123 | 134.6 | 17.5 | 41.2 | 78.6 | 0.00 % | 100.0 % | ✅ Cumple | Suma A + B constante (1000) y sin saldos negativos |
| M10 | Alertas de stock bajo GET /stock/alerts (50 VUs, 1 min) | 3000 | 48.5 | 13.1 | 23.4 | 47.6 | 0.00 % | 100.0 % | ✅ Cumple |  |
| M11 | Rate limiting: 20 req/s durante 60 s desde una IP (límite 600/min) | 1201 | 20.0 | 11.8 | 17.7 | 19.8 | 0.00 % | 100.0 % | ✅ Cumple | 607 atendidas y 594 limitadas con 429 |
| M12 | Rechazo de JWT ausente, mal formado o alterado (100 VUs, 1 min) | 11357 | 187.4 | 10.8 | 26.8 | 62.5 | 0.00 % | 100.0 % | ✅ Cumple |  |
| M13 | Soak: uso mixto del inventario (30 VUs, 10 min) | 17734 | 29.4 | 13.8 | 22.8 | 28.2 | 0.00 % | 100.0 % | ✅ Cumple | p95 primeros 2 min 24.7 ms vs. últimos 2 min 22.8 ms (×0.92, máx. ×1.5) |
| M14 | Mensajería: 200 purchase.received (+200 duplicados) hasta verse en stock | 400 | 88.2 | 3.1 | 4.2 | 7.3 | 0.00 % | 100.0 % | ✅ Cumple | Stock final 200 (esperado 200); todos aplicados en 1.4 s. Los tiempos de la tabla son los de publicar en RabbitMQ |
| M15 | Caída de RabbitMQ durante la carga: movimientos (30 VUs, 90 s; broker apagado ~30–60 s) | 5216 | 57.4 | 16.6 | 29.5 | 39.0 | 0.00 % | 100.0 % | ✅ Cumple | p95 antes: 30.8 ms · p95 sin broker: 29.4 ms · p95 despues: 28.1 ms |

Tras M15, eventos del outbox de stock pendientes de publicar: **0** (esperado 0: lo acumulado sin broker se publicó al volver).
