// Conexión a db_auth. Solo este servicio conoce estas credenciales (RNF02).
const { Pool } = require('pg');

function createPool(dbConfig) {
  return new Pool({ ...dbConfig, max: 10 });
}

// En Kubernetes no existe "depends_on": el servicio espera a que su BD responda.
async function waitForDatabase(pool, { retries = 15, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.warn(`[db] Base de datos no disponible (intento ${attempt}/${retries}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('No fue posible conectar con la base de datos');
}

module.exports = { createPool, waitForDatabase };
