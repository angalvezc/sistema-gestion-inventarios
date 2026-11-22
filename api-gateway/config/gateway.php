<?php

/*
|--------------------------------------------------------------------------
| Configuración del API Gateway (RNF05)
|--------------------------------------------------------------------------
| La tabla 'routes' es la traducción directa de la tabla "Resumen de
| endpoints" de la Entrega 2, §2.1. Cada regla es:
|   [método, ruta (sin /api/v1), servicio destino, roles permitidos]
|
|   "Todos"   -> cualquier usuario autenticado ($all)
|   "Público" -> no requiere token (null)
|   "Interno" -> no se publica: /auth/validate no está aquí y responde 404.
*/

$admin = 'ADMIN';
$operator = 'WAREHOUSE_OPERATOR';
$auditor = 'AUDITOR';
$all = [$admin, $operator, $auditor];

return [

    // Secreto compartido con ms-auth-users para verificar la firma HS256 (RNF07).
    'jwt_secret' => env('JWT_SECRET'),

    // Segundos máximos de espera por la respuesta de un microservicio.
    'timeout' => (int) env('UPSTREAM_TIMEOUT', 10),

    // Peticiones permitidas por IP cada minuto.
    'rate_limit' => (int) env('RATE_LIMIT_MAX', 600),

    // Service Discovery: nombres DNS de Docker Compose / Kubernetes (Entrega 2, §1.1).
    'services' => [
        'auth' => env('AUTH_URL', 'http://ms-auth-users:8081'),
        'products' => env('PRODUCTS_URL', 'http://ms-products:8082'),
        'stock' => env('STOCK_URL', 'http://ms-inventory-stock:8083'),
        'suppliers' => env('SUPPLIERS_URL', 'http://ms-suppliers:8084'),
        'purchases' => env('PURCHASES_URL', 'http://ms-purchases:8085'),
        'audit' => env('AUDIT_URL', 'http://ms-returns-audit:8086'),
    ],

    'routes' => [
        // ms-auth-users
        ['POST', 'auth/login', 'auth', null],
        // Público porque la credencial es el propio refresh token: cuando se
        // llama, el access token normalmente ya expiró.
        ['POST', 'auth/refresh', 'auth', null],
        ['GET', 'users', 'auth', [$admin]],
        ['POST', 'users', 'auth', [$admin]],
        ['PUT', 'users/{id}', 'auth', [$admin]],
        ['DELETE', 'users/{id}', 'auth', [$admin]],

        // ms-products
        ['GET', 'products', 'products', $all],
        ['POST', 'products', 'products', [$admin]],
        ['GET', 'products/{id}', 'products', $all],
        ['PUT', 'products/{id}', 'products', [$admin]],
        ['DELETE', 'products/{id}', 'products', [$admin]],
        ['GET', 'categories', 'products', $all],
        ['POST', 'categories', 'products', [$admin]],

        // ms-inventory-stock (las rutas fijas van antes que stock/{productId})
        ['GET', 'stock', 'stock', $all],
        ['GET', 'stock/alerts', 'stock', $all],
        ['POST', 'stock/movements', 'stock', [$admin, $operator]],
        ['POST', 'stock/transfers', 'stock', [$admin, $operator]],
        ['GET', 'stock/{productId}', 'stock', $all],
        ['PUT', 'stock/{productId}/min-threshold', 'stock', [$admin]],
        ['GET', 'warehouses', 'stock', $all],

        // ms-suppliers
        ['GET', 'suppliers', 'suppliers', $all],
        ['POST', 'suppliers', 'suppliers', [$admin]],
        ['GET', 'suppliers/{id}', 'suppliers', $all],
        ['PUT', 'suppliers/{id}', 'suppliers', [$admin]],
        ['DELETE', 'suppliers/{id}', 'suppliers', [$admin]],

        // ms-purchases
        ['GET', 'purchases/orders', 'purchases', $all],
        ['POST', 'purchases/orders', 'purchases', [$admin]],
        ['GET', 'purchases/orders/{id}', 'purchases', $all],
        ['POST', 'purchases/orders/{id}/approve', 'purchases', [$admin]],
        ['POST', 'purchases/orders/{id}/receive', 'purchases', [$admin, $operator]],
        ['POST', 'purchases/orders/{id}/cancel', 'purchases', [$admin]],

        // ms-returns-audit
        ['GET', 'audit/kardex', 'audit', [$auditor, $admin]],
        // Verificación de la cadena de hashes (RNF12). Va antes de kardex/{id}
        // para que "verify" no se tome como un id.
        ['GET', 'audit/kardex/verify', 'audit', [$auditor, $admin]],
        ['GET', 'audit/kardex/{id}', 'audit', [$auditor, $admin]],
        ['POST', 'audit/returns', 'audit', [$admin, $operator]],
        ['GET', 'audit/returns', 'audit', $all],
        ['GET', 'audit/dashboard/metrics', 'audit', $all],
    ],
];
