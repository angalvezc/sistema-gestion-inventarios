# Imagen del API Gateway (basada en docker/Dockerfile.microservice).
# El gateway no tiene base de datos ni contrato OpenAPI propio, por eso no copia
# migrations/ ni openapi.yaml. Se construye desde la RAÍZ del repositorio:
#   docker build -f api-gateway/Dockerfile -t logitech/api-gateway:1.0.0 .

# ---------- Etapa 1: dependencias de producción ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY api-gateway/package.json api-gateway/package-lock.json ./
RUN npm ci --omit=dev

# ---------- Etapa 2: imagen final ----------
FROM node:20-alpine
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY api-gateway/package.json ./
COPY api-gateway/src ./src

USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health/live" || exit 1

CMD ["node", "src/index.js"]
