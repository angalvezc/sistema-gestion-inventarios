-- db_products: modelo de datos de ms-products (Entrega 2, sección 3.2)

CREATE TABLE category (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  description VARCHAR(200),
  CONSTRAINT uq_category_name UNIQUE (name)
);

-- Categorías iniciales de insumos tecnológicos de LogiTech Solutions S.A.S.
INSERT INTO category (name, description) VALUES
  ('Computadores',   'Portátiles, equipos de escritorio y servidores'),
  ('Periféricos',    'Teclados, mouse, monitores, impresoras y diademas'),
  ('Redes',          'Routers, switches, access points y cableado'),
  ('Componentes',    'Memorias RAM, procesadores, tarjetas y fuentes'),
  ('Almacenamiento', 'Discos duros, unidades SSD y memorias USB');

CREATE TABLE product (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         VARCHAR(40)  NOT NULL,
  barcode     VARCHAR(14)  NOT NULL,
  name        VARCHAR(150) NOT NULL,
  description VARCHAR(500),
  category_id INT NOT NULL REFERENCES category(id),
  base_price  NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
  unit        VARCHAR(10)  NOT NULL CHECK (unit IN ('UND', 'CAJA')),
  active      BOOLEAN      NOT NULL DEFAULT TRUE,   -- baja lógica
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- RF02: SKU y código de barras únicos. Con nombre para saber cuál se violó.
  CONSTRAINT uq_product_sku UNIQUE (sku),
  CONSTRAINT uq_product_barcode UNIQUE (barcode)
);

CREATE INDEX idx_product_category ON product (category_id);

-- Especificaciones técnicas clave/valor (ej. "RAM" = "16 GB").
CREATE TABLE product_spec (
  id         SERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  spec_key   VARCHAR(60)  NOT NULL,
  spec_value VARCHAR(200) NOT NULL,
  UNIQUE (product_id, spec_key)
);
