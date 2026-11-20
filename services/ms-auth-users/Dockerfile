# Imagen de ms-auth-users (basada en docker/Dockerfile.microservice).
# Se construye desde la RAÍZ del repositorio para poder incluir el contrato OpenAPI:
#   docker build -f services/ms-auth-users/Dockerfile -t logitech/ms-auth-users:1.0.0 .

# ---------- Etapa 1: dependencias de producción ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY services/ms-auth-users/package.json services/ms-auth-users/package-lock.json ./
RUN npm ci --omit=dev

# ---------- Etapa 2: imagen final ----------
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=8081 \
    OPENAPI_PATH=/app/openapi.yaml
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY services/ms-auth-users/package.json ./
COPY services/ms-auth-users/src ./src
COPY services/ms-auth-users/migrations ./migrations
COPY docs/openapi/ms-auth-users.yaml ./openapi.yaml

USER node
EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health/live" || exit 1

CMD ["node", "src/index.js"]
