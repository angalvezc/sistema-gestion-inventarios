graph TD
    %% Estilos
    classDef client fill:#E1F5FE,stroke:#0288D1,stroke-width:2px,color:#01579B;
    classDef gateway fill:#FFF3E0,stroke:#F57C00,stroke-width:2px,color:#E65100;
    classDef microservice fill:#E8F5E9,stroke:#388E3C,stroke-width:2px,color:#1B5E20;
    classDef database fill:#EDE7F6,stroke:#512DA8,stroke-width:2px,color:#311B92;
    classDef broker fill:#FCE4EC,stroke:#C2185B,stroke-width:2px,color:#880E4F;

    %% Capa de Clientes Fuera del Clúster
    subgraph Capa_Clientes [Capa de Presentación / Clientes]
        WEB[Cliente Web App - React / Angular]:::client
        MOB[Cliente Móvil Bodega - iOS / Android]:::client
    end

    %% Clúster Contenerizado Docker / Orquestación Kubernetes
    subgraph K8S_CLUSTER [ Clúster de Kubernetes / Entorno Contenerizado Docker ]
        
        subgraph Capa_Perimetral [Capa Perimetral - API Gateway]
            GW[API Gateway Propio - HTTP/REST]:::gateway
        end

        subgraph Capa_Microservicios [Capa de Microservicios de Dominio]
            MS_AUTH[ms-auth-users<br/>Autenticación y RBAC]:::microservice
            MS_PROD[ms-products<br/>Catálogo de Productos]:::microservice
            MS_STOCK[ms-inventory-stock<br/>Stock y Bodegas]:::microservice
            MS_SUPP[ms-suppliers<br/>Proveedores]:::microservice
            MS_PURCH[ms-purchase-orders<br/>Órdenes de Compra]:::microservice
            MS_AUDIT[ms-returns-audit<br/>Devoluciones y Kardex]:::microservice
        end

        subgraph Capa_Eventos [Capa de Integración Asíncrona]
            RABBIT[Contenedor RabbitMQ<br/>Event Broker Central]:::broker
        end

        subgraph Capa_Persistencia [Capa de Datos Independiente - Contenedores MySQL]
            DB_AUTH[(Contenedor MySQL<br/>db_auth)]:::database
            DB_PROD[(Contenedor MySQL<br/>db_products)]:::database
            DB_STOCK[(Contenedor MySQL<br/>db_stock)]:::database
            DB_SUPP[(Contenedor MySQL<br/>db_suppliers)]:::database
            DB_PURCH[(Contenedor MySQL<br/>db_purchases)]:::database
            DB_AUDIT[(Contenedor MySQL<br/>db_audit)]:::database
        end

    end

    %% Peticiones de Clientes al API Gateway
    WEB -->|HTTPS / REST| GW
    MOB -->|HTTPS / REST| GW

    %% Rutas REST desde el API Gateway a los 6 Microservicios
    GW -->|REST: Autenticar / JWT| MS_AUTH
    GW -->|REST: Catálogo Productos| MS_PROD
    GW -->|REST: Consulta / Ajuste Stock| MS_STOCK
    GW -->|REST: Gestión Proveedores| MS_SUPP
    GW -->|REST: Crear / Aprobar Compras| MS_PURCH
    GW -->|REST: Consulta Kardex / Reportes / Dashboard| MS_AUDIT

    %% Conexiones 1:1 de Microservicio a su Contenedor MySQL
    MS_AUTH --- DB_AUTH
    MS_PROD --- DB_PROD
    MS_STOCK --- DB_STOCK
    MS_SUPP --- DB_SUPP
    MS_PURCH --- DB_PURCH
    MS_AUDIT --- DB_AUDIT

    %% Eventos Asíncronos vía RabbitMQ
    MS_PURCH -.->|Publica: orden.recibida| RABBIT
    RABBIT -.->|Consume: Incrementar Stock| MS_STOCK

    MS_STOCK -.->|Publica: movimiento.kardex_creado| RABBIT
    RABBIT -.->|Consume: Archivar Kardex Inmutable| MS_AUDIT

    MS_AUDIT -.->|Publica: devolucion.registrada| RABBIT
    RABBIT -.->|Consume: Reingresar / Ajustar Stock| MS_STOCK
