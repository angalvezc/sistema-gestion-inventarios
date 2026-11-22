#!/usr/bin/env bash
# Prueba del flujo completo del sistema (evidencia de la Entrega 3).
#
# Uso, desde la raíz del repositorio y con el entorno levantado:
#   bash scripts/prueba-flujo-completo.sh
#
# 1) Desde el HOST comprueba que el único punto de entrada es el API Gateway:
#    ningún microservicio ni base de datos responde en localhost.
# 2) Lanza scripts/flujo-completo.js en un contenedor node:20-alpine (la misma imagen
#    de los microservicios, no hay que instalar nada) dentro de la red de Compose.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f docker/.env ]; then
  echo "No existe docker/.env (cópielo de docker/.env.example)" >&2
  exit 1
fi
set -a; . docker/.env; set +a

PASSED=0
TOTAL=0
check() { # check "descripción" <0|1>
  TOTAL=$((TOTAL + 1))
  if [ "$2" -eq 0 ]; then PASSED=$((PASSED + 1)); echo "✅ $1"; else echo "❌ $1"; fi
}

echo "── 0. Punto de entrada único (vista desde el host) ──────────────"
curl -s -o /dev/null --max-time 5 http://localhost:8080/health/live
check "el API Gateway responde en localhost:8080" $?

blocked=0
for port in 8081 8082 8083 8084 8085 8086 5432; do
  if curl -s -o /dev/null --max-time 2 "http://localhost:$port/"; then
    echo "   → el puerto $port SÍ responde desde el host"
    blocked=1
  fi
done
check "ningún microservicio (8081-8086) ni PostgreSQL (5432) es accesible directamente" $blocked

# Flujo completo dentro de la red de Docker Compose
docker run --rm --network logitech_backend \
  -v "$ROOT/scripts:/scripts:ro" \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD \
  node:20-alpine node /scripts/flujo-completo.js
FLOW=$?

echo "Verificaciones desde el host: $PASSED/$TOTAL"
if [ "$FLOW" -eq 0 ] && [ "$PASSED" -eq "$TOTAL" ]; then
  echo "RESULTADO GENERAL: ✅ todo el flujo funciona"
  exit 0
fi
echo "RESULTADO GENERAL: ❌ hay pasos con error (ver arriba)"
exit 1
