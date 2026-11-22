# Pruebas de rendimiento — Mariana Duque Giraldo

15 pruebas con [k6](https://k6.io) sobre el API Gateway, ms-auth-users y ms-inventory-stock.
k6 simula muchos usuarios a la vez y mide tiempos de respuesta y errores.
**No se instala**: corre con su imagen oficial de Docker dentro de la red de Docker Compose.

## Cómo ejecutarlas (Ubuntu, desde la raíz del repositorio)

1. Levantar el entorno completo:

   ```bash
   docker compose -f docker/docker-compose.yml up -d --build
   ```

2. Probar primero una sola (1 minuto) para confirmar que todo funciona:

   ```bash
   bash perf/mariana/run-all.sh M01
   ```

3. Ejecutar las 15 (unos 30 minutos):

   ```bash
   bash perf/mariana/run-all.sh
   ```

4. Ver la tabla en `perf/mariana/resultados/RESULTADOS.md`.
   El detalle completo de cada prueba queda en `resultados/<ID>.json`.

`run-all.sh` sube temporalmente el límite de peticiones del gateway (todas las pruebas salen
de una sola IP), lo baja a 600/min para M11 y al final lo restaura. En M15 apaga y enciende
RabbitMQ automáticamente. No modifica `docker/.env`.

## Las pruebas

| ID | Escenario | Requisito | Criterio |
| --- | --- | --- | --- |
| M01 | Login, carga base (20 VUs, 1 min) | RF01 | p95 < 500 ms |
| M02 | Login en pico (rampa 0 → 100 VUs) | RF01 | p95 < 1 s, error < 1 % |
| M03 | Refresh de token con rotación (30 VUs) | RNF07 | p95 < 300 ms |
| M04 | Sobrecosto del gateway: GET /stock directo vs. gateway | RNF05 | diferencia de p95 < 50 ms |
| M05 | Consulta de saldos GET /stock (50 VUs, 2 min) | RNF06 | p95 < 2 s |
| M06 | Saldo por producto GET /stock/{id} (100 VUs, 2 min) | RF03 | p95 < 2 s |
| M07 | Estrés: rampa 50 → 300 VUs | RNF06 | punto de quiebre (p95 ≥ 2 s) |
| M08 | 300 salidas concurrentes sobre 100 unidades | RF04 | 100 aceptadas, 200 rechazadas, saldo final 0 |
| M09 | Transferencias concurrentes A ↔ B (30 VUs) | RF05 | suma A + B constante, sin negativos |
| M10 | Alertas GET /stock/alerts (50 VUs) | RF06 | p95 < 1 s |
| M11 | 20 req/s durante 60 s desde una IP | Gateway | aparecen 429 al superar 600/min |
| M12 | JWT ausente, mal formado o alterado (100 VUs) | RNF07 | 100 % 401, p95 < 100 ms |
| M13 | Soak: uso mixto 10 min (30 VUs) | RNF06 | p95 final ≤ 1.5 × p95 inicial |
| M14 | 200 `purchase.received` (+200 duplicados) por RabbitMQ | RF10, RNF08 | stock = 200 en < 30 s |
| M15 | Caída de RabbitMQ durante la carga | RNF09 | error < 1 %, outbox vacío al final |

Convención: en cada script la petición medida lleva la etiqueta `name=main`; el login y la
preparación de datos (`name=setup`) no cuentan en los resultados.

Una prueba que sale "❌ No cumple" no es un error del script: es un resultado preliminar
válido que se analiza (por ejemplo, el login es lento a propósito por el costo de bcrypt).
