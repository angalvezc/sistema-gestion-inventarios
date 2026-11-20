<?php

use App\Http\Controllers\GatewayController;
use App\Http\Middleware\AuthorizeGatewayRoute;
use Illuminate\Support\Facades\Route;

/*
| Una sola ruta comodín recibe todo /api/v1/... (el prefijo "api" lo pone
| bootstrap/app.php). El orden de los middleware importa:
|   1. throttle:gateway       -> rate limiting por IP (definido en AppServiceProvider)
|   2. AuthorizeGatewayRoute  -> tabla de rutas, JWT y roles
|   3. GatewayController      -> reenvío al microservicio
*/
Route::any('v1/{path}', GatewayController::class)
    ->where('path', '.*')
    ->middleware(['throttle:gateway', AuthorizeGatewayRoute::class]);
