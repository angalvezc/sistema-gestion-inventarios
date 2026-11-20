<?php

namespace App\Http\Middleware;

use App\Gateway\RouteTable;
use App\Support\ApiError;
use Closure;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
    private const MIN_SECRET_LENGTH = 32;

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

        // Error de configuración (no del usuario): la librería exige mínimo 32 caracteres para HS256.
        $secret = (string) config('gateway.jwt_secret');
        if (strlen($secret) < self::MIN_SECRET_LENGTH) {
            Log::error('JWT_SECRET no está definido o tiene menos de '.self::MIN_SECRET_LENGTH.' caracteres');

            return ApiError::make($request, 500, 'GATEWAY_MISCONFIGURED', 'El gateway no tiene un JWT_SECRET válido (mínimo 32 caracteres)');
        }

        try {
            // Mismo secreto y algoritmo que usa ms-auth-users al firmar.
            // Rechaza firmas distintas, tokens vencidos y otros algoritmos.
            $claims = JWT::decode($token, new Key($secret, 'HS256'));
        } catch (Throwable $e) {
            // Al cliente no se le da el detalle; queda en el log para diagnóstico.
            Log::warning('Token rechazado: '.$e->getMessage());

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
