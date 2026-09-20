# Entrega 1: Investigación y Fundamentación
**Asignatura:** Ingeniería de Software II  
**Proyecto:** Sistema de Gestión de Inventarios basado en Arquitectura de Microservicios  
**Estudiante(s):** Mariana Duque Giraldo - Andrés Felipe Gálvez Carmona
**Empresa Caso de Estudio:** LogiTech Solutions S.A.S.
**Periodo cubierto:** 19/09/2026 - 28/09/2026  

---

## 1. Investigación de Sistemas Similares de Mercado

### 1.1 Odoo Inventory
* **Sitio web oficial:** [https://www.odoo.com](https://www.odoo.com)
* **Descripción:** Odoo es un sistema de gestión de recursos empresariales de código abierto (ERP), estructurado bajo un esquema monolito modular, ya que su módulo de gestión de inventarios está diseñado para la gestión de inventarios en tiempo real para procesos logísticos en organizaciones de diversos sectores comerciales e industriales (Odoo S.A., 2026).
* **Propósito:** Como lo menciona Dooit (2026), el propósito de este sistema es centralizar la operación de almacén y eliminar los *gaps* de información entre las áreas de compras, ventas y contabilidad. Con su inventario de doble entrada, cada vez que se mueve un producto queda registrado su origen y su destino; con ello no hay registros que aparezcan de la nada ni que se pierdan sin explicación, manejando cada producto por su número de serie, lote y fecha de caducidad.
* **Funcionalidades Principales:**
  * **Gestión Multi-bodega:** Soporta la administración de múltiples almacenes, con más de una bodega a la vez, y además soporta abastecimiento como *dropshipping*, fabricación bajo pedido y reabastecimiento automático cuando el producto baja.
  * **Valoración e Informes:** El kardex se calcula en tiempo real con el método que se desee elegir, integrando los asientos contables de forma automática.
* **Especificaciones Técnicas:** Odoo centraliza la lógica en un servidor Python y comparte una única base de datos PostgreSQL para todos sus módulos.
  * **Patrón de Arquitectura:** Odoo posee un monolito modular en el cual sus funciones se dividen conceptualmente en módulos independientes (como Ventas, Compras, Inventario y CRM). Odoo posee una sola base de datos relacional, haciendo que todos los módulos compartan el mismo esquema relacional.
  * **Protocolos:** Odoo no es un sistema cerrado ya que, como se mencionó anteriormente, permite que aplicaciones externas se conecten a él mediante estándares como JSON, XML y REST para leer, crear o modificar el inventario automáticamente sin necesidad de digitar datos en pantalla.
  * **Documentación Oficial y Código Fuente:** Odoo es un proyecto *Open Source* con su código base disponible en GitHub ([https://github.com/odoo/odoo.git](https://github.com/odoo/odoo.git)). Posee documentación oficial de producto y de arquitectura que muestra que está desarrollado en Python en su backend y utiliza PostgreSQL como motor de base de datos relacional.
* **Infraestructura Encontrada (Arquitectura Monolítica de 3 Capas):**
  * **Capa de Presentación:** HTML5, CSS y JavaScript (utilizando su framework web OWL).
  * **Capa de Lógica (Servidor Odoo):** Desarrollada en Python, ejecuta las reglas de negocio y expone el motor ORM para la manipulación de datos.
  * **Capa de Datos:** Exclusivamente PostgreSQL como RDBMS único para todos los módulos del sistema.

---

### 1.2 Zoho Inventory
* **Sitio web oficial:** [https://www.zoho.com/es-xl/inventory](https://www.zoho.com/es-xl/inventory)
* **Descripción:** Zoho Inventory es una plataforma de gestión de inventarios y control de pedidos orientada principalmente a pequeñas y medianas empresas (PYMEs), basada en la nube bajo el modelo SaaS. Posee soporte para operaciones de comercio electrónico multicanal, lo que ayuda a facilitar la centralización de existencias, ventas y despachos en tiempo real (Zoho Corporation, 2026).
* **Propósito:** Busca automatizar la cadena de suministros en entornos de venta minorista y mayorista.
* **Funcionalidades Principales:**
  * **Sincronización Multicanal de Comercio Electrónico:** Integración nativa con plataformas de e-commerce y marketplaces globales (Shopify, Amazon, eBay, WooCommerce, Etsy), actualizando el stock disponible automáticamente ante cada venta.
  * **Gestión de Pedidos y Despachos:** Control del ciclo de vida completo del pedido, desde la cotización y orden de venta hasta el empaquetado, generación de etiquetas de envío y facturación.
  * **Trazabilidad de Lotes y Números de Serie:** Seguimiento de inventario para control de calidad y vencimientos, asignando números de serie o lotes específicos a cada conjunto de mercancía.
  * **Alertas de Abastecimiento e Inventario Multi-bodega:** Definición de puntos de reorden por ubicación física y notificación automática cuando las existencias caen por debajo del umbral mínimo configurado.
* **Infraestructura Encontrada:** Según Zoho Corporation (2026), Zoho opera bajo una arquitectura de nube privada multi-tenant protegida por un API Gateway con cuotas de uso.
  * **Capa Perimetral:** API Gateway propio con balanceador de carga y limitador de concurrencia (*rate limiting*).
  * **Capa de Aplicación:** Clúster de servidores de aplicación compartidos entre múltiples clientes (inquilinos/*tenants*).
  * **Capa de Almacenamiento:** Motores de base de datos distribuidos (como CStore para consultas de lectura rápida) con aislamiento lógico de datos por organización.

---

### 1.3 Alegra
* **Sitio web oficial:** [https://www.alegra.com/](https://www.alegra.com/)
* **Descripción:** Según la documentación de Soluciones en la Nube S.A.S. (2026), Alegra es una plataforma comercial de gestión contable, facturación electrónica y control de inventarios alojada en la nube bajo el modelo Software como Servicio (SaaS). Desarrollada principalmente para pequeñas y medianas empresas (PYMEs) en América Latina con fuerte presencia en Colombia, su módulo de inventario está diseñado para administrar existencias, automatizar la facturación y mantener la sincronización con la contabilidad oficial en tiempo real.
* **Funcionalidades Principales (Soluciones en la Nube S.A.S., 2026):**
  * **Control de Existencias e Inventario Valorizado:** Permite el seguimiento de cantidades disponibles por producto, actualizando el Kardex y el costo de ventas de forma automática tras cada transacción comercial.
  * **Gestión Multi-bodega Básica:** Soporta la distribución de stock entre diferentes depósitos o puntos de venta, permitiendo transferencias internas de mercancía.
  * **Integración Nativa con Facturación Electrónica:** Vincula cada salida de inventario directamente con la expedición de facturas electrónicas avaladas por la DIAN (en Colombia) y otros entes reguladores de la región.
  * **Alertas de Stock Mínimo y Variantes:** Notificación de productos próximos a agotarse y capacidad de gestionar ítems con atributos específicos (talla, color, marca).
* **Infraestructura y Tecnologías Encontradas (Soluciones en la Nube S.A.S., 2026):**
  * **Patrón de Arquitectura:** Arquitectura SaaS en la nube multi-tenant. Toda la lógica de negocio, procesamiento contable y persistencia es administrada en servidores en la nube por el proveedor (Alegra / Soluciones en la Nube S.A.S.).
  * **Modelo de Despliegue:** Nube pública gestionada (*Fully Managed Cloud*), accesible desde navegadores web y aplicaciones móviles nativas (Android/iOS).
  * **Interfaces y Protocolos:** Expone una API RESTful documentada que utiliza datos en formato JSON y autenticación mediante credenciales Basic Auth o Tokens de API para la sincronización con tiendas virtuales o sistemas externos.
  * **Mecanismos de Eventos:** Dispone de soporte de Webhooks para notificar cambios en clientes, facturas o ítems hacia aplicaciones externas en tiempo real.

---

### 1.4 Cuadro Comparativo de Sistemas de Mercado

| Criterio Técnico | Odoo Inventory | Zoho Inventory | Alegra (Nube) |
| :--- | :--- | :--- | :--- |
| **Estilo Arquitectónico** | Monolito tradicional dividido en 3 capas (usando Python en el backend, PostgreSQL en la base de datos y JavaScript en el frontend). | Sistema SaaS donde la aplicación y los servidores son administrados internamente por Zoho. | Plataforma SaaS en la nube donde la infraestructura es compartida y gestionada por la empresa Alegra. |
| **Enfoque Principal y Mercado Objetivo** | Un ERP completo para empresas medianas o grandes con procesos de inventario complejos. | Enfocado en PyMEs que venden por internet (e-commerce) y necesitan gestionar pedidos de varios canales. | Pensado para pequeñas empresas en Latinoamérica que necesitan llevar contabilidad, facturación electrónica e inventario. |
| **Modelo de Licenciamiento y Costo** | Se paga una suscripción por usuario al mes (versión Enterprise) o se usa la versión gratis (Community) instalándose en el propio servidor. | Suscripción mensual o anual en la nube, donde el precio sube según la cantidad de pedidos gestionados. | Planes de pago mensual o anual que limitan la cantidad de facturas, comprobantes y usuarios. |
| **Funcionalidades Clave** | Sistema de inventario de doble entrada, trazabilidad por lotes/series, manejo de varias bodegas y módulo de fabricación. | Sincronización automática con tiendas como Shopify o Amazon, lectura de códigos de barras y gestión de despachos. | Facturación electrónica adaptada a la DIAN, punto de venta (POS), catálogo de productos, compras y reportes. |
| **Usabilidad y Manejo** | Exige una curva de aprendizaje alta; la interfaz es compleja porque abarca todo el ERP. | Interfaz moderna, bastante limpia e intuitiva para que el equipo de ventas o bodega la aprenda a usar rápido. | Muy amigable y fácil de entender, pensada para personas sin conocimientos avanzados de sistemas o contabilidad. |
| **Acceso y Movilidad** | Se ingresa desde cualquier navegador web y cuenta con aplicación móvil para tareas dentro del almacén. | Sistema 100% en la nube, accesible desde el navegador o mediante sus aplicaciones para iOS y Android. | Funciona completamente en la nube (SaaS), ingresando desde internet en computadores o celulares. |
| **Modelo de Persistencia** | Utiliza una sola base de datos centralizada (PostgreSQL) para todos los módulos del sistema. | La base de datos es administrada por Zoho y los datos se separan lógicamente por el ID de cada organización. | Base de datos privada y gestionada por el proveedor, a la cual el usuario no tiene acceso directo. |
| **Escalabilidad y Rendimiento** | Para escalar hay que meterle más recursos a todo el servidor monolítico; riesgo de lentitud si la base de datos se satura. | El rendimiento depende del proveedor y existen límites en la cantidad de peticiones que se pueden hacer a su API. | La velocidad depende del plan contratado y de qué tan cargados estén los servidores compartidos de Alegra. |

---
