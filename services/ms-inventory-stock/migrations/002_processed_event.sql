-- Consumo idempotente de eventos (Paso 5).
-- RabbitMQ garantiza entrega "al menos una vez": un mismo evento puede llegar dos veces.
-- Antes de aplicar un evento se inserta su eventId aquí, en la MISMA transacción;
-- si ya existía, el evento se ignora y el stock no se suma dos veces.
CREATE TABLE processed_event (
  event_id     UUID PRIMARY KEY,
  event_type   VARCHAR(60) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
