<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Formato único de error (Entrega 2, §2.2), igual al de los microservicios:
 * { code, message, details, timestamp, path }
 */
class ApiError
{
    public static function make(
        Request $request,
        int $status,
        string $code,
        string $message,
        mixed $details = null
    ): JsonResponse {
        return response()->json([
            'code' => $code,
            'message' => $message,
            'details' => $details,
            'timestamp' => now()->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'path' => $request->getRequestUri(),
        ], $status);
    }
}
