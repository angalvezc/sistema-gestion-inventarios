# Imagen de ms-purchases (basada en docker/Dockerfile.microservice).
# Se construye desde la RAÍZ del repositorio para poder incluir el contrato OpenAPI:
#   docker build -f services/ms-purchases/Dockerfile -t logitech/ms-purchases:1.0.0 .

# ---------- Etapa 1: dependencias de producción ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY services/ms-purchases/package.json services/ms-purchases/package-lock.json ./
RUN npm ci --omit=dev

# ---------- Etapa 2: imagen final ----------
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=8085 \
    OPENAPI_PATH=/app/openapi.yaml
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY services/ms-purchases/package.json ./
COPY services/ms-purchases/src ./src
COPY services/ms-purchases/migrations ./migrations
COPY docs/openapi/ms-purchases.yaml ./openapi.yaml

USER node
EXPOSE 8085

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health/live" || exit 1

CMD ["node", "src/index.js"]
