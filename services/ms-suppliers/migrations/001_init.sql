-- db_suppliers: modelo de datos de ms-suppliers (Entrega 2, sección 3.4)

CREATE TABLE supplier (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nit            VARCHAR(20)  NOT NULL,          -- formato 900123456-7 (con dígito de verificación)
  business_name  VARCHAR(150) NOT NULL,          -- razón social
  email          VARCHAR(150) NOT NULL,
  phone          VARCHAR(30),
  address        VARCHAR(200),
  payment_terms  VARCHAR(60)  NOT NULL,          -- ej. "Contado", "Crédito 30 días"
  lead_time_days INT NOT NULL CHECK (lead_time_days BETWEEN 0 AND 365),
  active         BOOLEAN NOT NULL DEFAULT TRUE,  -- baja lógica
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_supplier_nit UNIQUE (nit)        -- RF08: un proveedor por NIT
);

CREATE TABLE supplier_contact (
  id          SERIAL PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  role        VARCHAR(60),                       -- cargo: "Asesor comercial", "Cartera"...
  email       VARCHAR(150),
  phone       VARCHAR(30)
);

CREATE INDEX idx_contact_supplier ON supplier_contact (supplier_id);
