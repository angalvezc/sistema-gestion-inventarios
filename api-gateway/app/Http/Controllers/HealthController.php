<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

/**
 * Salud del gateway (Entrega 2, §4.1): /health/live y /health/ready.
 * No depende de los microservicios: si uno cae, el gateway sigue "listo"
 * y atiende las rutas de los demás (RNF09).
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(['status' => 'UP']);
    }
}
