# Imagen del API Gateway (Laravel 12 sobre la imagen oficial php:8.3-apache).
# Se construye desde la RAÍZ del repositorio, igual que los microservicios:
#   docker build -f api-gateway/Dockerfile -t logitech/api-gateway:1.0.0 .

# ---------- Etapa 1: dependencias PHP con Composer ----------
FROM composer:2 AS vendor
WORKDIR /app
COPY api-gateway/composer.json api-gateway/composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --no-scripts --no-autoloader
COPY api-gateway/ ./
RUN composer dump-autoload --no-dev --optimize

# ---------- Etapa 2: imagen final con Apache + PHP ----------
FROM php:8.3-apache

# OPcache (rendimiento) y mod_rewrite (lo usa el .htaccess de Laravel).
RUN docker-php-ext-install opcache && a2enmod rewrite

# Apache escucha en 8080: un usuario sin privilegios no puede usar el puerto 80.
COPY api-gateway/docker/apache.conf /etc/apache2/sites-available/000-default.conf
COPY api-gateway/docker/php.ini /usr/local/etc/php/conf.d/gateway.ini
RUN echo "Listen 8080" > /etc/apache2/ports.conf

# Valores no secretos por defecto (los secretos llegan por variables de entorno).
ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    SESSION_DRIVER=array \
    CACHE_STORE=file \
    QUEUE_CONNECTION=sync

WORKDIR /var/www/html
COPY --from=vendor --chown=www-data:www-data /app /var/www/html

# Seguridad: Apache corre con el usuario www-data, sin privilegios de root.
USER www-data

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD curl -fsS http://localhost:8080/health/live || exit 1
