// Identidad del usuario que hizo la petición. La pone el API Gateway en los
// encabezados X-User-* después de validar el JWT (el cliente no puede falsificarlos).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestUser(req) {
  const id = req.get('x-user-id');
  return {
    id: id && UUID_RE.test(id) ? id : null,
    email: req.get('x-user-email') || null,
    role: req.get('x-user-role') || null,
  };
}

module.exports = { requestUser };
