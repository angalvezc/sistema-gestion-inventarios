-- db_purchases: modelo de datos de ms-purchases (Entrega 2, sección 3.5)
-- supplier_id, product_id y los usuarios son referencias LÓGICAS a otras bases (RNF02).

-- Número de orden legible y consecutivo: OC-000001, OC-000002...
-- La secuencia de PostgreSQL nunca entrega el mismo número dos veces, aunque
-- se creen varias órdenes al mismo tiempo.
CREATE SEQUENCE order_number_seq;

CREATE TABLE purchase_order (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number             VARCHAR(20) NOT NULL
                           DEFAULT ('OC-' || lpad(nextval('order_number_seq')::text, 6, '0')),
  supplier_id              UUID NOT NULL,
  destination_warehouse_id INT  NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                           CHECK (status IN ('DRAFT', 'APPROVED', 'RECEIVED', 'CANCELLED')),
  total_amount             NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  created_by               UUID,
  approved_by              UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at              TIMESTAMPTZ,
  CONSTRAINT uq_order_number UNIQUE (order_number)
);

CREATE INDEX idx_order_status ON purchase_order (status);
CREATE INDEX idx_order_supplier ON purchase_order (supplier_id);

CREATE TABLE purchase_order_item (
  id           SERIAL PRIMARY KEY,
  order_id     UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL,
  sku_snapshot VARCHAR(40) NOT NULL,   -- SKU al momento de la compra
  quantity     INT NOT NULL CHECK (quantity > 0),
  unit_cost    NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
  UNIQUE (order_id, product_id)
);

-- Trazabilidad del ciclo de vida: quién cambió el estado y cuándo.
CREATE TABLE order_status_history (
  id          SERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
  from_status VARCHAR(20),            -- NULL en la creación
  to_status   VARCHAR(20) NOT NULL,
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_history_order ON order_status_history (order_id, changed_at);

-- Patrón Outbox (Entrega 2, §1.5): purchase.received se guarda en la MISMA
-- transacción que el cambio a RECEIVED y luego se publica en RabbitMQ.
CREATE TABLE outbox_event (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(60) NOT NULL,
  payload    JSONB NOT NULL,
  published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending ON outbox_event (created_at) WHERE published = FALSE;
