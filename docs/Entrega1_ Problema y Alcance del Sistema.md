# ENTREGA 1: INVESTIGACIÓN Y FUNDAMENTACIÓN
| Proyecto | Sistema de Gestión de Inventarios – LogiTech Solutions S.A.S. |
| :--- | :--- |
| **Equipo / Integrantes** | Mariana Duque Giraldo, Andrés Felipe Gálvez Carmona |
| **Entrega N.°** | 1 |
| **Periodo cubierto** | 19/09/2026 - 28/09/2026 |


## 2. Definición del Problema y Alcance del Sistema (Caso de Estudio)

### 2.1 Caso de Estudio: LogiTech Solutions S.A.S.
LogiTech Solutions S.A.S. es una empresa dedicada a la comercialización y distribución al por mayor de insumos tecnológicos. Actualmente opera mediante dos (2) bodegas físicas de almacenamiento y distribución a nivel nacional.

### 2.2 Planteamiento del Problema
A partir del análisis de mercado realizado en la Sección 1, se evidencia que las soluciones comerciales imponen severas limitaciones: los sistemas monolíticos (como Odoo) concentran la carga operativa en una única base de datos relacional compartida, mientras que las plataformas SaaS (como Zoho y Alegra) imponen restricciones de personalización (*vendor lock-in*) y límites estrictos de peticiones por API (*rate-limiting*).

Actualmente, LogiTech Solutions S.A.S. padece estas deficiencias al gestionar sus dos bodegas mediante un **sistema monolítico heredado combinado con hojas de cálculo descentralizadas de Excel**. Esta operativa genera:

1. **Desfase de Inventario:** Descuadres entre el stock registrado y las existencias físicas reales, provocando ventas de productos agotados y retrasos en despachos.
2. **Saturación por Concurrencia:** En periodos de alta demanda, las consultas simultáneas sobrecargan la base de datos compartida, provocando caídas del sistema y tiempos de respuesta superiores a los 2.0 segundos permitidos.
3. **Punto Único de Falla (*Single Point of Failure - SPOF*):** Al estar todos los procesos acoplados, un error en la generación de reportes o facturación bloquea por completo la consulta de stock y la operación del personal en bodega.
4. **Ausencia de Auditabilidad:** Inexistencia de un registro inalterable (Kardex) que audite quién, cuándo y desde qué bodega realizó una entrada, salida o devolución de mercancía.

---

### 2.3 Alcance del Sistema a Construir

El proyecto comprende el diseño, desarrollo, contenerización y orquestación de una solución distribuida a la medida para LogiTech Solutions S.A.S., compuesta por una interfaz de usuario cliente en **React**, un API Gateway propio para el control de acceso perimetral, seis (6) microservicios con persistencia independiente (*Database-per-Service*) y comunicación asíncrona mediante un Message Broker.

#### 2.3.1 Componentes Funcionales del Alcance
El sistema abarcará la automatización e integración técnica de los siguientes módulos operativos:

1. **Gestión Perimetral de Seguridad y Frontend en React:** Aplicación web cliente desarrollada en **React** que consume los servicios protegidos del API Gateway mediante tokens JWT y asignación de roles (Administrador, Operario de Bodega, Auditor).
2. **Catálogo Unificado de Productos:** Administración del inventario maestro de insumos tecnológicos, permitiendo la codificación mediante SKU únicos, códigos de barras, categorización, especificaciones técnicas y precios base.
3. **Control de Existencias Multi-bodega en Tiempo Real:** Monitoreo continuo del saldo de productos distribuido de forma independiente entre las dos (2) bodegas físicas de la empresa, gestionando transferencias internas de mercancía y emitiendo alertas automáticas por stock mínimo o agotado.
4. **Gestión del Flujo de Reabastecimiento y Proveedores:** Administración del directorio de proveedores comerciales y automatización del ciclo de vida de las órdenes de compra (creación, aprobación, recepción de mercancía y actualización automática de existencias en bodega).
5. **Auditoría e Historial de Kardex Inmutable:** Registro cronológico e inalterable de cada movimiento de mercancía (entradas, salidas, transferencias y devoluciones por garantía o avería), permitiendo la generación de reportes operativos y métricas consolidadas para el panel de control (Dashboard).

#### 2.3.2 Estrategia de Comunicación e Integración Técnica
- **Comunicación Síncrona (vía HTTP/REST + JSON):** Utilizada para las peticiones desde el cliente en **React** hacia el API Gateway, autenticación de usuarios y consultas de lectura que requieren respuesta inmediata (como la verificación de saldo disponible por bodega o la consulta del catálogo).
- **Comunicación Asíncrona (vía RabbitMQ Message Broker):** Utilizada para la propagación de eventos de negocio en segundo plano entre microservicios. Por ejemplo, al confirmar la recepción de una orden de compra, el evento notifica al microservicio de stock para incrementar unidades sin bloquear al usuario, cada cambio de saldo emite un evento asíncrono para archivar el movimiento en el historial inmutable del Kardex.

#### 2.3.3 Estructura Operativa del Kardex
- **Procesamiento Inmediato de Saldo (`ms-inventory-stock`):** El servicio de existencias actualiza de forma síncrona el saldo disponible en la bodega correspondiente dentro de su base de datos dedicada, garantizando consistencia local y tiempos de respuesta menores a 2 segundos.
- **Archivo Inmutable de Auditoría (`ms-returns-audit`):** De forma asíncrona, el servicio de existencias emite el evento del movimiento hacia el broker de mensajería (RabbitMQ), permitiendo que el servicio de auditoría consuma el mensaje y guarde el registro histórico en su base de datos dedicada en modo solo lectura (*append-only*).

#### 2.3.4 Delimitación del Entorno Tecnológico y Despliegue
- **Persistencia Isolada:** Cada módulo mantendrá su propio contenedor de base de datos relacional/NoSQL independiente, evitando consultas compartidas o dependencias directas entre esquemas.
- **Contenerización y Orquestación:** Todos los componentes de software (interfaz React, API Gateway, microservicios, bases de datos independientes y el broker RabbitMQ) se empaquetarán en contenedores Docker y se orquestarán mediante Kubernetes para simular un ambiente de producción de alta disponibilidad.

---

## 3. Justificación Técnica de la Arquitectura de Microservicios frente a una Arquitectura Monolítica

La elección de una arquitectura de microservicios desacoplada consumida por un cliente en **React** frente a un esquema monolítico se fundamenta en los siguientes criterios de ingeniería de software:

1. **Aislamiento de Fallas y Alta Disponibilidad:** En un monolito, una falla en la generación de reportes puede tumbar todo el servidor. En esta arquitectura, si `ms-returns-audit` o `ms-suppliers` presentan fallos, el cliente en React puede continuar operando los servicios críticos de autenticación (`ms-auth-users`) e inventario (`ms-inventory-stock`) sin interrupción.
2. **Escalabilidad Horizontal Granular e Independiente:** Operaciones de alta demanda (como la consulta de disponibilidad por bodega) se escalan de forma independiente aumentando réplicas de pods en Kubernetes para `ms-inventory-stock`, sin necesidad de duplicar todo el sistema.
3. **Desacoplamiento de Persistencia (*Database-per-Service*):** Cada microservicio posee su propio contenedor de base de datos independiente (`db_auth`, `db_products`, `db_stock`, `db_suppliers`, `db_purchases`, `db_audit`). Esto elimina por completo los cuellos de botella por bloqueo de tablas (*table locking*) comunes en las bases de datos monolíticas compartidas.
4. **Separación Clara entre Frontend y Backend:** La aplicación cliente desarrollada en **React** es completamente agnóstica de la infraestructura del backend; consume únicamente endpoints REST expuestos por el API Gateway, facilitando el desarrollo paralelo y la mantenibilidad del código.

---

## 4. Identificación Preliminar de Microservicios (*Bounded Contexts*)

En correspondencia con los principios de *Domain-Driven Design* (DDD), se delimitan los siguientes seis (6) microservicios:

| Microservicio | Dominio / *Bounded Context* | Base de Datos Propia | Responsabilidad Principal |
| :--- | :--- | :--- | :--- |
| **`ms-auth-users`** | Autenticación y Seguridad | `db_auth` (Contenedor Dedicated) | Control de acceso perimetral, gestión de roles (RBAC) y emisión/validación de tokens JWT. |
| **`ms-products`** | Catálogo de Productos | `db_products` (Contenedor Dedicated) | Registro de insumos tecnológicos, especificaciones, categorías y códigos de barras / SKU. |
| **`ms-inventory-stock`** | Control de Stock y Existencias | `db_stock` (Contenedor Dedicated) | Gestión de saldos en tiempo real por bodega (2 bodegas), transferencias y cálculo de existencias. |
| **`ms-suppliers`** | Proveedores | `db_suppliers` (Contenedor Dedicated) | Directorio de proveedores, contactos y condiciones comerciales de suministro. |
| **`ms-purchases`** | Órdenes de Compra | `db_purchases` (Contenedor Dedicated) | Gestión del ciclo de vida de órdenes de compra y notificación de recepción de mercancía. |
| **`ms-returns-audit`** | Devoluciones y Kardex Histórico | `db_audit` (Contenedor Dedicated) | Procesamiento de garantías/devoluciones y almacenamiento del Kardex inmutable (*append-only*). |

