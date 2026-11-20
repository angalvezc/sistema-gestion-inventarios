-- db_auth: modelo de datos de ms-auth-users (Entrega 2, sección 3.1)
-- gen_random_uuid() viene incluido en PostgreSQL 13+.

CREATE TABLE role (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(30) NOT NULL UNIQUE,
  description VARCHAR(200)
);

-- "user" es palabra reservada en PostgreSQL, por eso la tabla se llama users.
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  role_id       INT NOT NULL REFERENCES role(id),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE refresh_token (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 del token; nunca se guarda el token plano
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_refresh_token_user ON refresh_token(user_id);

INSERT INTO role (name, description) VALUES
  ('ADMIN', 'Administrador: gestiona usuarios, catálogo, compras y configuración'),
  ('WAREHOUSE_OPERATOR', 'Operario de bodega: registra movimientos, transferencias y recepciones'),
  ('AUDITOR', 'Auditor: consulta el Kardex y los reportes en modo lectura');
