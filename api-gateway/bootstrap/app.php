<?php

use App\Http\Controllers\HealthController;
use App\Support\ApiError;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',   // prefijo /api -> /api/v1/...
        commands: __DIR__.'/../routes/console.php',
        then: function () {
            Route::get('/health/live', HealthController::class);
            Route::get('/health/ready', HealthController::class);
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // En Kubernetes hay un Ingress delante: TRUSTED_PROXIES permite leer la IP real del cliente.
        if (env('TRUSTED_PROXIES')) {
            $middleware->trustProxies(at: env('TRUSTED_PROXIES'));
        }
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Todos los errores salen en el formato único de la Entrega 2, §2.2.
        $exceptions->render(function (Throwable $e, Request $request) {
            return match (true) {
                $e instanceof HttpResponseException => null, // respuestas ya armadas (p. ej. el 429)
                $e instanceof NotFoundHttpException => ApiError::make($request, 404, 'NOT_FOUND', 'Ruta no encontrada'),
                $e instanceof MethodNotAllowedHttpException => ApiError::make($request, 405, 'METHOD_NOT_ALLOWED', 'Método no permitido'),
                $e instanceof PostTooLargeException => ApiError::make($request, 413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera el tamaño permitido'),
                $e instanceof HttpExceptionInterface => ApiError::make($request, $e->getStatusCode(), 'HTTP_ERROR', $e->getMessage() ?: 'Error HTTP'),
                default => ApiError::make($request, 500, 'INTERNAL_ERROR', 'Error interno del gateway'),
            };
        });
    })->create();
