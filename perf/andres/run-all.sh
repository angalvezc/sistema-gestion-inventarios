#!/usr/bin/env bash
# Ejecuta las pruebas de rendimiento de Andrés (k6) y arma resultados/RESULTADOS.md.
#
# Uso (desde la raíz del repositorio, con el entorno de Docker Compose levantado):
#   bash perf/andres/run-all.sh             # las 15 pruebas (~25 min)
#   bash perf/andres/run-all.sh A01 A07     # solo algunas
#
# k6 no se instala: corre con su imagen oficial de Docker, conectado a la red
# interna de Compose (logitech_backend).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker/docker-compose.yml)
K6_IMAGE="grafana/k6:0.54.0"
NETWORK="logitech_backend"
PERF_DIR="$ROOT/perf/andres"
RESULTS="$PERF_DIR/resultados"

# Credenciales del admin desde docker/.env
set -a; . docker/.env; set +a

ALL=(A01 A02 A03 A04 A05 A06 A07 A08 A09 A10 A11 A12 A13 A14 A15)
if [ "$#" -gt 0 ]; then TESTS=("$@"); else TESTS=("${ALL[@]}"); fi

mkdir -p "$RESULTS"

wait_healthy() {
  local service="$1" status=""
  for _ in $(seq 1 60); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$("${COMPOSE[@]}" ps -q "$service")" 2>/dev/null || true)
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  echo "ERROR: $service no quedó healthy" >&2
  exit 1
}

run_k6() {
  # "|| true": si una prueba no cumple sus umbrales, k6 termina con error, pero se sigue con las demás.
  docker run --rm -i --user "$(id -u):$(id -g)" --network "$NETWORK" \
    -v "$PERF_DIR:/perf" -w /perf \
    -e ADMIN_EMAIL -e ADMIN_PASSWORD \
    "$K6_IMAGE" run --quiet "$1" || true
}

# Todas las pruebas salen de una sola IP: se sube el límite del gateway para que el
# rate limiting no altere las mediciones (no modifica docker/.env).
echo ">> Gateway con RATE_LIMIT_MAX=1000000"
RATE_LIMIT_MAX=1000000 "${COMPOSE[@]}" up -d --force-recreate api-gateway >/dev/null
wait_healthy api-gateway

for id in "${TESTS[@]}"; do
  script=$(cd "$PERF_DIR" && ls "$id"-*.js 2>/dev/null | head -n 1 || true)
  if [ -z "$script" ]; then echo "No existe la prueba $id" >&2; continue; fi

  echo ""
  echo "################ $id ($script) ################"
  if [ "$id" = "A15" ]; then
    # Caída programada de la auditoría: se apaga ~30 s después de iniciar la carga y
    # se enciende 30 s más tarde (los primeros segundos son la preparación de datos).
    (
      sleep 33; echo ">> [A15] Apagando ms-returns-audit";  "${COMPOSE[@]}" stop ms-returns-audit >/dev/null
      sleep 30; echo ">> [A15] Encendiendo ms-returns-audit"; "${COMPOSE[@]}" start ms-returns-audit >/dev/null
    ) &
    OUTAGE_PID=$!
    run_k6 "$script"
    wait "$OUTAGE_PID"
  else
    run_k6 "$script"
  fi
done

echo ""
echo ">> Restaurando el gateway con su configuración normal"
"${COMPOSE[@]}" up -d --force-recreate api-gateway >/dev/null

# ---------- Tabla de resultados ----------
{
  echo "# Resultados preliminares de rendimiento — Andrés Felipe Gálvez Carmona"
  echo ""
  echo "Fecha: $(date '+%Y-%m-%d %H:%M') · Herramienta: k6 ($K6_IMAGE) · Entorno: Docker Compose en $(uname -sr)"
  echo ""
  echo "Tiempos en milisegundos, medidos sobre la petición principal de cada prueba (sin login ni preparación de datos)."
  echo ""
  echo "| ID | Escenario | Peticiones | Req/s | Mediana | p95 | p99 | Errores | Checks | Resultado | Observaciones |"
  echo "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  for id in "${ALL[@]}"; do
    if [ -f "$RESULTS/$id.md" ]; then cat "$RESULTS/$id.md"; fi
  done
} > "$RESULTS/RESULTADOS.md"

echo ""
echo ">> Tabla generada en perf/andres/resultados/RESULTADOS.md"
