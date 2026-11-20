<?php

namespace App\Providers;

use App\Gateway\RouteTable;
use App\Support\ApiError;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Una sola instancia de la tabla de rutas, construida desde config/gateway.php.
        $this->app->singleton(RouteTable::class, fn () => new RouteTable(config('gateway.routes')));
    }

    public function boot(): void
    {
        // Rate limiting (Entrega 2, §1.1): N peticiones por minuto por IP.
        // El middleware throttle agrega X-RateLimit-Limit, X-RateLimit-Remaining y Retry-After.
        RateLimiter::for('gateway', function (Request $request) {
            return Limit::perMinute(config('gateway.rate_limit'))
                ->by($request->ip())
                ->response(fn (Request $request, array $headers) => ApiError::make(
                    $request, 429, 'TOO_MANY_REQUESTS', 'Demasiadas peticiones, intente más tarde'
                )->withHeaders($headers));
        });
    }
}
