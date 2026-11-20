<?php

namespace App\Http\Controllers;

use App\Support\ApiError;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

/**
 * Reenvía la petición (ya autorizada) al microservicio que le corresponde.
 */
class GatewayController extends Controller
{
    // Encabezados que no deben pasar al microservicio.
    private const BLOCKED_HEADERS = [
        'host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
        'te', 'trailer', 'expect',
        'content-length', // el cliente HTTP lo recalcula
        'authorization',  // el JWT ya se validó aquí; el servicio recibe la identidad en X-User-*
    ];

    // Encabezados de la respuesta del microservicio que se devuelven al cliente.
    private const PASSTHROUGH_RESPONSE_HEADERS = ['Content-Type', 'Location', 'Retry-After'];

    public function __invoke(Request $request): Response
    {
        $rule = $request->attributes->get('gateway.rule');
        $user = $request->attributes->get('gateway.user');

        // Se conserva la ruta completa y el query string: /api/v1/stock?warehouseId=1
        $url = rtrim(config("gateway.services.{$rule['service']}"), '/').$request->getRequestUri();

        $client = Http::withHeaders($this->buildHeaders($request, $user))
            ->timeout(config('gateway.timeout'))
            ->withoutRedirecting();

        $body = $request->getContent();
        if ($body !== '') {
            $client = $client->withBody($body, $request->header('Content-Type', 'application/json'));
        }

        try {
            $upstream = $client->send($request->method(), $url);
        } catch (ConnectionException $e) {
            // Aislamiento de fallas (RNF09): si un servicio no responde, solo fallan SUS rutas.
            if (str_contains($e->getMessage(), 'cURL error 28')) {
                return ApiError::make($request, 504, 'GATEWAY_TIMEOUT', 'El servicio no respondió a tiempo');
            }

            return ApiError::make($request, 503, 'SERVICE_UNAVAILABLE', 'El servicio no está disponible en este momento');
        }

        $response = response($upstream->body(), $upstream->status());
        foreach (self::PASSTHROUGH_RESPONSE_HEADERS as $name) {
            if ($upstream->header($name) !== '') {
                $response->header($name, $upstream->header($name));
            }
        }

        return $response;
    }

    private function buildHeaders(Request $request, ?array $user): array
    {
        $headers = [];
        foreach ($request->headers->all() as $name => $values) {
            // Se descartan los X-User-* que mande el cliente: si no, podría hacerse pasar por ADMIN.
            if (in_array($name, self::BLOCKED_HEADERS, true) || str_starts_with($name, 'x-user-')) {
                continue;
            }
            $headers[$name] = implode(', ', $values);
        }

        if ($user !== null) {
            $headers['X-User-Id'] = $user['id'];
            $headers['X-User-Email'] = $user['email'];
            $headers['X-User-Role'] = $user['role'];
        }

        return $headers;
    }
}
