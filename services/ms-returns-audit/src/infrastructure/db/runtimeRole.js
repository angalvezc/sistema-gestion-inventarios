// RNF12: crea (o actualiza) el rol restringido con el que trabaja el servicio.
//
// Por qué: en Docker, el usuario de db_audit (POSTGRES_USER) es el DUEÑO de la base.
// Sobre el dueño un REVOKE no tiene efecto y además podría desactivar el trigger del
// Kardex. Por eso:
//   - las migraciones corren con el dueño (crean tablas, trigger y permisos);
//   - el servicio se conecta con audit_runtime, que solo puede SELECT e INSERT en el Kardex.
const RUNTIME_ROLE = 'audit_runtime';

async function ensureRuntimeRole(ownerPool, password) {
  const { rows } = await ownerPool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [RUNTIME_ROLE]);
  const action = rows.length === 0 ? 'CREATE ROLE %I LOGIN PASSWORD %L' : 'ALTER ROLE %I LOGIN PASSWORD %L';
  // Una sentencia DDL no acepta parámetros ($1): format() con %I y %L arma la
  // sentencia escapando el nombre y la contraseña de forma segura.
  const sql = await ownerPool.query(`SELECT format('${action}', $1::text, $2::text) AS ddl`, [RUNTIME_ROLE, password]);
  await ownerPool.query(sql.rows[0].ddl);
  console.log(`[db] Rol restringido ${RUNTIME_ROLE} ${rows.length === 0 ? 'creado' : 'actualizado'}`);
}

module.exports = { ensureRuntimeRole, RUNTIME_ROLE };
