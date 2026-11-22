-- db_audit: modelo de datos de ms-returns-audit (Entrega 2, sección 3.6)
-- Esta migración la ejecuta el usuario DUEÑO de la base. El servicio luego trabaja
-- con el rol restringido audit_runtime (creado por src/infrastructure/db/runtimeRole.js).

-- ---------------- Kardex inalterable (RF07, RNF12) ----------------
CREATE TABLE kardex_entry (
  id                  BIGSERIAL PRIMARY KEY,               -- secuencial, solo INSERT
  event_id            UUID NOT NULL,                       -- idempotencia: un evento = una fila
  product_id          UUID NOT NULL,
  sku_snapshot        VARCHAR(40),                         -- SKU al momento del movimiento (de ms-products)
  warehouse_id        INT NOT NULL,
  movement_type       VARCHAR(20) NOT NULL,
  quantity            INT NOT NULL,
  balance_after       INT NOT NULL,
  reference           VARCHAR(100),
  user_id             UUID,
  user_email_snapshot VARCHAR(150),
  occurred_at         TIMESTAMPTZ NOT NULL,                -- cuándo pasó en ms-inventory-stock
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),  -- cuándo llegó al Kardex
  row_hash            CHAR(64) NOT NULL,                   -- SHA-256 encadenado con la fila anterior
  CONSTRAINT uq_kardex_event UNIQUE (event_id)
);

CREATE INDEX idx_kardex_product ON kardex_entry (product_id, occurred_at);
CREATE INDEX idx_kardex_warehouse ON kardex_entry (warehouse_id, occurred_at);
CREATE INDEX idx_kardex_occurred ON kardex_entry (occurred_at);

-- Defensa 1 (Entrega 2, §3.6): trigger que bloquea cualquier cambio o borrado.
-- Aplica a TODOS los usuarios, incluido el dueño de la base.
CREATE FUNCTION kardex_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'kardex_entry es append-only: no se permite %', TG_OP;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kardex_no_update_delete
BEFORE UPDATE OR DELETE ON kardex_entry
FOR EACH ROW EXECUTE FUNCTION kardex_block_changes();

CREATE TRIGGER trg_kardex_no_truncate
BEFORE TRUNCATE ON kardex_entry
FOR EACH STATEMENT EXECUTE FUNCTION kardex_block_changes();

-- ---------------- Devoluciones y garantías (RF11) ----------------
CREATE SEQUENCE return_number_seq;

CREATE TABLE return_request (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number VARCHAR(20) NOT NULL
                DEFAULT ('DEV-' || lpad(nextval('return_number_seq')::text, 6, '0')),
  origin        VARCHAR(20) NOT NULL CHECK (origin IN ('CLIENT', 'SUPPLIER')),
  reason        VARCHAR(300) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'REGISTERED' CHECK (status IN ('REGISTERED', 'PROCESSED')),
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_return_number UNIQUE (return_number)
);

CREATE TABLE return_item (
  id           SERIAL PRIMARY KEY,
  return_id    UUID NOT NULL REFERENCES return_request(id),
  product_id   UUID NOT NULL,
  quantity     INT NOT NULL CHECK (quantity > 0),
  disposition  VARCHAR(20) NOT NULL CHECK (disposition IN ('RESTOCK', 'DAMAGED')),
  warehouse_id INT NOT NULL
);

CREATE INDEX idx_return_item_return ON return_item (return_id);

-- Patrón Outbox para return.processed.
CREATE TABLE outbox_event (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(60) NOT NULL,
  payload    JSONB NOT NULL,
  published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_pending ON outbox_event (created_at) WHERE published = FALSE;

-- ---------------- Defensa 2 (Entrega 2, §3.6): permisos ----------------
-- El servicio se conecta como audit_runtime, que NO es dueño de las tablas:
-- por eso el REVOKE sí tiene efecto y tampoco puede desactivar el trigger.
GRANT USAGE ON SCHEMA public TO audit_runtime;

REVOKE UPDATE, DELETE, TRUNCATE ON kardex_entry FROM audit_runtime;
GRANT  SELECT, INSERT ON kardex_entry TO audit_runtime;

GRANT SELECT, INSERT ON return_request TO audit_runtime;
GRANT SELECT, INSERT ON return_item TO audit_runtime;
GRANT SELECT, INSERT, UPDATE ON outbox_event TO audit_runtime;   -- UPDATE para marcar "published"
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO audit_runtime;
