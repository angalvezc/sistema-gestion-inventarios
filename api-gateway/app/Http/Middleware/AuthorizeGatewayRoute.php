<?php

namespace App\Http\Middleware;

use App\Gateway\RouteTable;
use App\Support\ApiError;
use Closure;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Autenticación (JWT, RNF07) y autorización por rol (RBAC) de cada petición.
 *
 * 1. Busca la regla de la ruta en la tabla de config/gateway.php (404 / 405).
 * 2. Si la ruta no es pública, verifica el JWT con el secreto compartido (401).
 * 3. Comprueba que el rol del token esté permitido en esa ruta (403).
 */
class AuthorizeGatewayRoute
{
    public function __construct(private RouteTable $routes)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $result = $this->routes->match($request->method(), (string) $request->route('path'));

        if (($result['status'] ?? null) === 404) {
            return ApiError::make($request, 404, 'NOT_FOUND', 'Ruta no encontrada');
        }
        if (($result['status'] ?? null) === 405) {
            return ApiError::make($request, 405, 'METHOD_NOT_ALLOWED', "Método {$request->method()} no permitido en esta ruta");
        }

        $rule = $result['rule'];
        $request->attributes->set('gateway.rule', $rule);

        if ($rule['roles'] === null) {
            return $next($request); // ruta pública
        }

        $token = $request->bearerToken();
        if (! $token) {
            return ApiError::make($request, 401, 'UNAUTHORIZED', 'Falta el token (Authorization: Bearer <JWT>)');
        }

        try {
            // Mismo secreto y algoritmo que usa ms-auth-users al firmar.
            // Rechaza firmas distintas, tokens vencidos y otros algoritmos.
            $claims = JWT::decode($token, new Key(config('gateway.jwt_secret'), 'HS256'));
        } catch (Throwable) {
            return ApiError::make($request, 401, 'UNAUTHORIZED', 'Token inválido o expirado');
        }

        $user = [
            'id' => $claims->sub ?? null,
            'email' => $claims->email ?? null,
            'role' => $claims->role ?? null,
        ];

        if (! in_array($user['role'], $rule['roles'], true)) {
            return ApiError::make($request, 403, 'FORBIDDEN', "El rol {$user['role']} no tiene permiso para esta operación");
        }

        $request->attributes->set('gateway.user', $user);

        return $next($request);
    }
}
