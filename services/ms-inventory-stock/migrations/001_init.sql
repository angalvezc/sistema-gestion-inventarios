-- db_stock: modelo de datos de ms-inventory-stock (Entrega 2, sección 3.3)
-- product_id y user_id son referencias LÓGICAS a db_products y db_auth:
-- no tienen llave foránea porque viven en otras bases de datos (RNF02).

CREATE TABLE warehouse (
  id   SERIAL PRIMARY KEY,
  code VARCHAR(10)  NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL
);

-- Las dos bodegas de LogiTech Solutions S.A.S. (RF03)
INSERT INTO warehouse (code, name, city) VALUES
  ('BOD-A', 'Bodega A', 'Manizales'),
  ('BOD-B', 'Bodega B', 'Medellín');

-- Saldo de cada producto en cada bodega.
CREATE TABLE stock_level (
  id            SERIAL PRIMARY KEY,
  product_id    UUID NOT NULL,
  warehouse_id  INT  NOT NULL REFERENCES warehouse(id),
  quantity      INT  NOT NULL DEFAULT 0 CHECK (quantity >= 0),   -- RF04: nunca negativo
  min_threshold INT  NOT NULL DEFAULT 0 CHECK (min_threshold >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  version       INT  NOT NULL DEFAULT 0,                          -- se incrementa en cada cambio
  UNIQUE (product_id, warehouse_id)
);

CREATE TABLE stock_transfer (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_warehouse_id INT NOT NULL REFERENCES warehouse(id),
  to_warehouse_id   INT NOT NULL REFERENCES warehouse(id),
  user_id           UUID,
  status            VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

-- Historial local de movimientos (el Kardex inalterable vive en ms-returns-audit).
CREATE TABLE stock_movement (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL,
  warehouse_id  INT  NOT NULL REFERENCES warehouse(id),
  type          VARCHAR(20) NOT NULL
                CHECK (type IN ('ENTRY', 'EXIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN_IN')),
  quantity      INT  NOT NULL CHECK (quantity > 0),
  balance_after INT  NOT NULL,
  transfer_id   UUID REFERENCES stock_transfer(id),
  reference     VARCHAR(100),
  user_id       UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movement_product ON stock_movement (product_id, warehouse_id, created_at);

-- Patrón Outbox (Entrega 2, §1.5): el evento se guarda en la MISMA transacción que
-- el movimiento; en el Paso 5 un proceso lo envía a RabbitMQ y lo marca publicado.
CREATE TABLE outbox_event (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(60) NOT NULL,
  payload    JSONB NOT NULL,
  published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending ON outbox_event (created_at) WHERE published = FALSE;
