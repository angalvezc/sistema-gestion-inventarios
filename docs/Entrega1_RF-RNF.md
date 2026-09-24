## 5. Documento de Requerimientos Funcionales y No Funcionales

### 5.1 Requerimientos Funcionales (RF)
* **RF01 (Autenticación y RBAC):** El sistema debe autenticar usuarios desde el cliente en **React** mediante credenciales únicas y controlar accesos según roles (Administrador, Operario de Bodega, Auditor) vía `ms-auth-users`.
* **RF02 (Gestión de Productos):** El sistema debe permitir administrar el catálogo de insumos tecnológicos asociados a SKU y códigos de barras únicos vía `ms-products`.
* **RF03 (Control de Existencias Multi-bodega):** El sistema debe mantener el saldo actualizado de existencias físicas distribuidas en las dos (2) bodegas de LogiTech Solutions S.A.S. vía `ms-inventory-stock`.
* **RF04 (Entradas y Salidas de Stock):** El sistema debe registrar incrementos y decrementos de existencias, impidiendo saldos negativos en bodega vía `ms-inventory-stock`.
* **RF05 (Transferencias entre Bodegas):** El sistema debe permitir el traslado de mercancía entre las dos bodegas (Bodega A y Bodega B) de forma consistente vía `ms-inventory-stock`.
* **RF06 (Alertas de Stock Bajo):** El sistema debe notificar en la interfaz en React cuando las existencias de un producto caigan por debajo del umbral mínimo configurado vía `ms-inventory-stock`.
* **RF07 (Registro e Histórico Kardex):** El sistema debe almacenar de forma inalterable y en modo solo lectura cada movimiento de inventario realizado vía `ms-returns-audit`.
* **RF08 (Gestión de Proveedores):** El sistema debe administrar el directorio de proveedores de insumos tecnológicos vía `ms-suppliers`.
* **RF09 (Órdenes de Compra):** El sistema debe gestionar la creación y flujo de aprobación de órdenes de reabastecimiento vía `ms-purchases`.
* **RF10 (Recepción de Mercancía):** Al confirmar la recepción de una compra en `ms-purchases`, el sistema debe publicar un evento para incrementar el stock automáticamente en `ms-inventory-stock`.
* **RF11 (Devoluciones y Garantías):** El sistema debe procesar mercancía devuelta por cliente o proveedor, diferenciando entre reingreso a stock y baja por avería vía `ms-returns-audit`.
* **RF12 (Dashboard de Métricas):** El cliente en **React** debe presentar métricas consolidadas (valor total de inventario, productos agotados, movimientos del día) consumidos vía API Gateway.

### 5.2 Requerimientos No Funcionales (RNF)
* **RNF01 (Estilo Arquitectónico):** Sistema construido bajo arquitectura de microservicios autónomos y desacoplados con cliente Web en React.
* **RNF02 (Persistencia Independiente):** Aplicación estricta del patrón *Database-per-Service*. Se prohíben *joins* o accesos compartidos entre bases de datos de distintos microservicios.
* **RNF03 (Contenerización Docker):** Todos los componentes (Frontend React, API Gateway, microservicios, bases de datos y RabbitMQ) deben ser empacados en imágenes Docker.
* **RNF04 (Orquestación Kubernetes):** Despliegue de la infraestructura contenerizada sobre Kubernetes (K8s) garantizando alta disponibilidad.
* **RNF05 (API Gateway Propio):** Punto de entrada unificado desarrollado a la medida para enrutamiento perimetral y validación de seguridad.
* **RNF06 (Tiempo de Respuesta):** El 95% de las consultas de disponibilidad de stock deben responder en un tiempo inferior a 2.0 segundos.
* **RNF07 (Seguridad JWT):** Peticiones protegidas mediante tokens JWT firmados transmitidos en el encabezado `Authorization`.
* **RNF08 (Comunicación Asíncrona):** Integración de eventos de dominio entre microservicios utilizando RabbitMQ como Message Broker.
* **RNF09 (Aislamiento de Fallas):** La caída de un servicio secundario no debe afectar la operación del Core de inventarios ni de autenticación.
* **RNF10 (Escalabilidad Horizontal - HPA):** Configuración de autoescalado horizontal de pods en Kubernetes según consumo de CPU/Memoria.
* **RNF11 (Mantenibilidad y Clean Code):** Implementación de Arquitectura Limpia o Hexagonal en el código fuente de cada servicio.
* **RNF12 (Inalterabilidad de Auditoría):** La base de datos `db_audit` restringe comandos `UPDATE` o `DELETE` en los registros del Kardex.
* **RNF13 (Documentación OpenAPI):** Exposición de documentación interactiva de endpoints REST utilizando Swagger UI / OpenAPI 3.0.
* **RNF14 (Portabilidad y Despliegue):** Capacidad de desplegar la totalidad del entorno mediante scripts automatizados en Docker Compose y Kubernetes.
