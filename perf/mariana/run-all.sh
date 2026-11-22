#!/usr/bin/env bash
# Ejecuta las pruebas de rendimiento de Mariana (k6) y arma resultados/RESULTADOS.md.
#
# Uso (desde la raíz del repositorio, con el entorno de Docker Compose levantado):
#   bash perf/mariana/run-all.sh            # las 15 pruebas (~30 min)
#   bash perf/mariana/run-all.sh M01 M05    # solo algunas
#
# k6 no se instala: corre con su imagen oficial de Docker, conectado a la red
# interna de Compose (logitech_backend). Así puede llamar al gateway y, en M04,
# también directo a ms-inventory-stock para comparar.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker/docker-compose.yml)
K6_IMAGE="grafana/k6:0.54.0"
NETWORK="logitech_backend"
PERF_DIR="$ROOT/perf/mariana"
RESULTS="$PERF_DIR/resultados"

# Credenciales del admin y de RabbitMQ desde docker/.env
set -a; . docker/.env; set +a

# Orden: M11 al final porque necesita reiniciar el gateway con el límite normal.
ALL=(M01 M02 M03 M04 M05 M06 M07 M08 M09 M10 M12 M13 M14 M15 M11)
if [ "$#" -gt 0 ]; then TESTS=("$@"); else TESTS=("${ALL[@]}"); fi

mkdir -p "$RESULTS"
CURRENT_LIMIT=""

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

# Recrea el gateway con otro límite de peticiones por minuto (no modifica docker/.env).
set_rate_limit() {
  [ "$CURRENT_LIMIT" = "$1" ] && return 0
  echo ">> Gateway con RATE_LIMIT_MAX=$1"
  RATE_LIMIT_MAX="$1" "${COMPOSE[@]}" up -d --force-recreate api-gateway >/dev/null
  wait_healthy api-gateway
  CURRENT_LIMIT="$1"
}

run_k6() {
  # "|| true": si una prueba no cumple sus umbrales, k6 termina con error, pero se sigue con las demás.
  docker run --rm -i --user "$(id -u):$(id -g)" --network "$NETWORK" \
    -v "$PERF_DIR:/perf" -w /perf \
    -e ADMIN_EMAIL -e ADMIN_PASSWORD -e RABBITMQ_USER -e RABBITMQ_PASSWORD \
    "$K6_IMAGE" run --quiet "$1" || true
}

pending_outbox() {
  "${COMPOSE[@]}" exec -T db-stock sh -c \
    'psql -U "$POSTGRES_USER" -d db_stock -tAc "SELECT COUNT(*) FROM outbox_event WHERE published = FALSE"' | tr -d '[:space:]'
}

OUTBOX_NOTE=""

for id in "${TESTS[@]}"; do
  script=$(cd "$PERF_DIR" && ls "$id"-*.js 2>/dev/null | head -n 1 || true)
  if [ -z "$script" ]; then echo "No existe la prueba $id" >&2; continue; fi

  # Todas las pruebas salen de una sola IP: se sube el límite para que el rate
  # limiting no altere las mediciones. M11 mide justamente el límite normal (600).
  if [ "$id" = "M11" ]; then set_rate_limit 600; else set_rate_limit 1000000; fi

  echo ""
  echo "################ $id ($script) ################"
  if [ "$id" = "M15" ]; then
    # Caída programada del broker: se apaga ~30 s después de iniciar la carga y se
    # enciende 30 s más tarde (los primeros segundos son la preparación de datos).
    (
      sleep 35; echo ">> [M15] Apagando RabbitMQ";  "${COMPOSE[@]}" stop rabbitmq >/dev/null
      sleep 30; echo ">> [M15] Encendiendo RabbitMQ"; "${COMPOSE[@]}" start rabbitmq >/dev/null
    ) &
    OUTAGE_PID=$!
    run_k6 "$script"
    wait "$OUTAGE_PID"
    wait_healthy rabbitmq

    echo ">> [M15] Esperando que el outbox publique los eventos acumulados..."
    pending="?"
    for _ in $(seq 1 45); do
      pending=$(pending_outbox)
      [ "$pending" = "0" ] && break
      sleep 2
    done
    OUTBOX_NOTE="Tras M15, eventos del outbox de stock pendientes de publicar: **${pending}** (esperado 0: lo acumulado sin broker se publicó al volver)."
    echo ">> [M15] $OUTBOX_NOTE"
  else
    run_k6 "$script"
  fi
done

# Deja el gateway con el límite configurado en docker/.env (o 600 por defecto).
echo ""
echo ">> Restaurando el gateway con su configuración normal"
"${COMPOSE[@]}" up -d --force-recreate api-gateway >/dev/null

# ---------- Tabla de resultados ----------
{
  echo "# Resultados preliminares de rendimiento — Mariana Duque Giraldo"
  echo ""
  echo "Fecha: $(date '+%Y-%m-%d %H:%M') · Herramienta: k6 ($K6_IMAGE) · Entorno: Docker Compose en $(uname -sr)"
  echo ""
  echo "Tiempos en milisegundos, medidos sobre la petición principal de cada prueba (sin login ni preparación de datos)."
  echo ""
  echo "| ID | Escenario | Peticiones | Req/s | Mediana | p95 | p99 | Errores | Checks | Resultado | Observaciones |"
  echo "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  for id in M01 M02 M03 M04 M05 M06 M07 M08 M09 M10 M11 M12 M13 M14 M15; do
    if [ -f "$RESULTS/$id.md" ]; then cat "$RESULTS/$id.md"; fi
  done
  if [ -n "$OUTBOX_NOTE" ]; then echo ""; echo "$OUTBOX_NOTE"; fi
} > "$RESULTS/RESULTADOS.md"

echo ""
echo ">> Tabla generada en perf/mariana/resultados/RESULTADOS.md"
