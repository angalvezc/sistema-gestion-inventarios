# Resultados preliminares de rendimiento — Andrés Felipe Gálvez Carmona

Fecha: 2026-11-22 19:12 · Herramienta: k6 (grafana/k6:0.54.0) · Entorno: Docker Compose en Linux 7.0.0-42-generic

Tiempos en milisegundos, medidos sobre la petición principal de cada prueba (sin login ni preparación de datos).

| ID | Escenario | Peticiones | Req/s | Mediana | p95 | p99 | Errores | Checks | Resultado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A01 | Listado de productos GET /products (50 VUs, 2 min) | 5738 | 47.2 | 13.5 | 25.6 | 60.3 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A02 | Búsqueda de productos GET /products?q= (50 VUs, 2 min) | 5950 | 48.9 | 12.8 | 23.7 | 41.4 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A03 | Creación concurrente con SKU duplicado (20 VUs x 5 rondas) | 100 | 336.9 | 37.2 | 49.4 | 60.7 | 0.00 % | 100.0 % | ✅ Cumple | 5 creados y 95 rechazados con 409 (esperado 5 / 95) |
| A04 | Detalle de producto GET /products/{id} (100 VUs, 1 min) | 5761 | 93.4 | 13.4 | 27.9 | 73.8 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A05 | Directorio de proveedores GET /suppliers (50 VUs, 1 min) | 2968 | 48.2 | 13.0 | 24.0 | 109.9 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A06 | Creación de proveedores con contacto (20 VUs, 1 min) | 2320 | 38.4 | 18.0 | 29.8 | 38.5 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A07 | Crear órdenes de compra con validación REST (30 VUs, 2 min) | 3508 | 28.9 | 26.0 | 46.2 | 104.9 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A08 | Aprobar órdenes de compra (20 VUs, 1 min) | 2138 | 35.2 | 24.5 | 44.7 | 55.5 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A09 | Recepción de órdenes hasta verse en stock (10 VUs, 1 min) | 300 | 5.0 | 19.8 | 31.7 | 36.2 | 0.00 % | 100.0 % | ✅ Cumple | Latencia de extremo a extremo (compras → RabbitMQ → stock): mediana 930 ms, p95 979 ms |
| A10 | Ráfaga: 100 recepciones simultáneas (50 VUs) | 100 | 11.8 | 42.0 | 4602.0 | 5185.5 | 0.00 % | 100.0 % | ❌ No cumple | Stock final 100 (esperado 100); los eventos pendientes se aplicaron 0.5 s después de terminar la ráfaga |
| A11 | Consulta del Kardex con filtros (50 VUs, 2 min) | 5881 | 47.2 | 18.9 | 31.9 | 44.7 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A12 | Verificación de la cadena del Kardex mientras se registran movimientos (3 + 10 VUs, 1 min) | 117 | 1.9 | 534.0 | 782.7 | 804.5 | 0.00 % | 100.0 % | ✅ Cumple | 100 % de las verificaciones reportaron la cadena íntegra |
| A13 | Registro de devoluciones RESTOCK + DAMAGED (20 VUs, 1 min) | 2300 | 37.8 | 19.3 | 37.1 | 105.5 | 0.00 % | 100.0 % | ✅ Cumple | 2300 devoluciones registradas; cada una reingresó 1 unidad a BOD-A por evento |
| A14 | Métricas del dashboard (50 VUs, 1 min) | 2691 | 44.2 | 51.0 | 82.3 | 3560.1 | 0.00 % | 100.0 % | ✅ Cumple |  |
| A15 | Caída de ms-returns-audit durante la carga (20 VUs, 90 s; auditoría apagada ~30–60 s) | 3480 | 37.4 | 17.9 | 27.8 | 35.3 | 0.00 % | 100.0 % | ✅ Cumple | p95 antes: 29.8 ms · p95 sin auditoria: 26.2 ms · p95 despues: 26.5 ms. Movimientos faltantes en el Kardex tras volver: 0 |
