// Adaptador de hashing de contraseñas. En db_auth solo se guarda password_hash.
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

class BcryptPasswordHasher {
  hash(plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  compare(plain, hash) {
    return bcrypt.compare(plain, hash);
  }
}

module.exports = { BcryptPasswordHasher };
