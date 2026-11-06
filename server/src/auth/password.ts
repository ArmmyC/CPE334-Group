import { randomBytes, scrypt, type ScryptOptions } from 'node:crypto';

// Password hashing from SDS section 7.1 (NFR-01). Verification is added with login (F-01).
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

// Returns `scrypt$N$r$p$salt$hash` with a base64 salt and hash.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, SCRYPT);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}
