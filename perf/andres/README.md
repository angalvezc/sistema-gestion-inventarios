# Pruebas de rendimiento — Andrés Felipe Gálvez Carmona

15 pruebas con [k6](https://k6.io) sobre ms-products, ms-suppliers, ms-purchases y
ms-returns-audit, siempre a través del API Gateway. k6 simula muchos usuarios a la vez y
mide tiempos de respuesta y errores. **No se instala**: corre con su imagen oficial de
Docker dentro de la red de Docker Compose.

## Cómo ejecutarlas (Ubuntu, desde la raíz del repositorio)

1. Levantar el entorno completo:

   ```bash
   docker compose -f docker/docker-compose.yml up -d --build
   ```

2. Probar primero una sola (2 minutos) para confirmar que todo funciona:

   ```bash
   bash perf/andres/run-all.sh A01
   ```

3. Ejecutar las 15 (unos 25 minutos):

   ```bash
   bash perf/andres/run-all.sh
   ```

4. Ver la tabla en `perf/andres/resultados/RESULTADOS.md`.
   El detalle completo de cada prueba queda en `resultados/<ID>.json`.

`run-all.sh` sube temporalmente el límite de peticiones del gateway (todas las pruebas salen
de una sola IP) y al final lo restaura. En A15 apaga y enciende ms-returns-audit
automáticamente. No modifica `docker/.env`.

## Las pruebas

| ID | Escenario | Requisito | Criterio |
| --- | --- | --- | --- |
| A01 | Listado de productos (50 VUs, 2 min) | RF02 | p95 < 1 s |
| A02 | Búsqueda por nombre, SKU o código de barras (50 VUs, 2 min) | RF02 | p95 < 1.5 s |
| A03 | 20 usuarios crean a la vez el mismo SKU, 5 rondas | RF02 | 5 creados, 95 rechazados con 409, ningún 500 |
| A04 | Detalle de producto con especificaciones (100 VUs) | RF02 | p95 < 500 ms |
| A05 | Directorio y búsqueda de proveedores (50 VUs) | RF08 | p95 < 1 s |
| A06 | Creación de proveedores con contacto y NIT válido (20 VUs) | RF08 | p95 < 1 s |
| A07 | Crear órdenes (validación REST a productos y proveedores) (30 VUs, 2 min) | RF09 | p95 < 2 s |
| A08 | Aprobar órdenes (20 VUs) | RF09 | p95 < 1 s |
| A09 | Recibir órdenes y medir hasta verlas en stock (10 VUs) | RF10 | extremo a extremo p95 < 3 s |
| A10 | Ráfaga de 100 recepciones simultáneas (50 VUs) | RF10, RNF08 | stock final = 100 en < 30 s |
| A11 | Kardex con filtros: producto, bodega, tipo y fecha (50 VUs, 2 min) | RF07 | p95 < 2 s |
| A12 | Verificación de la cadena de hashes mientras se registran movimientos | RNF12 | 100 % íntegra, p95 < 5 s |
| A13 | Devoluciones RESTOCK + DAMAGED (20 VUs) | RF11 | p95 < 1.5 s y stock = 1 unidad por devolución |
| A14 | Métricas del dashboard (50 VUs) | RF12 | p95 < 2 s |
| A15 | Caída de ms-returns-audit durante la carga | RNF09 | error < 1 % y 0 movimientos faltantes en el Kardex |

Convención: en cada script la petición medida lleva la etiqueta `name=main`; el login y la
preparación de datos (`name=setup`) no cuentan en los resultados.

Una prueba que sale "❌ No cumple" no es un error del script: es un resultado preliminar
válido que se analiza.
