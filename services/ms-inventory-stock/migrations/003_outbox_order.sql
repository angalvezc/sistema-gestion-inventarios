-- Orden real de publicación de los eventos.
--
-- created_at (now()) es la hora en que EMPEZÓ la transacción, no la hora en que se
-- aplicó el cambio: con movimientos simultáneos sobre el mismo producto, una
-- transacción que empezó antes pero esperó el bloqueo de la fila quedaría ordenada
-- antes de otra que en realidad ocurrió primero.
--
-- seq se asigna al insertar el evento, cuando la fila de stock_level ya está
-- bloqueada: para un mismo producto y bodega, su orden es el orden real de los
-- movimientos. Así el Kardex (ms-returns-audit) los recibe en el orden correcto.
ALTER TABLE outbox_event ADD COLUMN seq BIGSERIAL;

DROP INDEX IF EXISTS idx_outbox_pending;
CREATE INDEX idx_outbox_pending ON outbox_event (seq) WHERE published = FALSE;
