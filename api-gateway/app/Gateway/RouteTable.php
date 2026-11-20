<?php

namespace App\Gateway;

/**
 * Busca a qué regla de config/gateway.php corresponde una petición.
 */
class RouteTable
{
    /** @param array<int, array{0:string,1:string,2:string,3:?array}> $rules */
    public function __construct(private array $rules)
    {
    }

    /**
     * Devuelve ['rule' => [...]] si hay coincidencia,
     * o ['status' => 404] si la ruta no existe,
     * o ['status' => 405] si la ruta existe pero no con ese método.
     */
    public function match(string $method, string $path): array
    {
        $path = trim($path, '/');

        $samePath = array_filter(
            $this->rules,
            fn (array $rule) => preg_match($this->toRegex($rule[1]), $path) === 1
        );

        if ($samePath === []) {
            return ['status' => 404];
        }

        foreach ($samePath as [$ruleMethod, $rulePath, $service, $roles]) {
            if ($ruleMethod === $method) {
                return ['rule' => [
                    'method' => $ruleMethod,
                    'path' => $rulePath,
                    'service' => $service,
                    'roles' => $roles,
                ]];
            }
        }

        return ['status' => 405];
    }

    // "stock/{productId}" -> #^stock/[^/]+$#
    private function toRegex(string $rulePath): string
    {
        return '#^'.preg_replace('/\{[A-Za-z]+\}/', '[^/]+', $rulePath).'$#';
    }
}
