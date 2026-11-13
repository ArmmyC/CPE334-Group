import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Password hashing from SDS section 7.1 (NFR-01).
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

// Returns `scrypt$N$r$p$salt$hash` with a base64 salt and hash.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, KEY_BYTES, SCRYPT);
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

// Checks a password against a stored `scrypt$N$r$p$salt$hash` string in constant time.
// A stored value that is not in that format, or that scrypt rejects, returns false.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (![N, r, p].every(Number.isSafeInteger) || salt.length === 0 || expected.length === 0) {
    return false;
  }
  try {
    const key = await deriveKey(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// A fixed hash to verify against when the email is unknown, so a login for a missing
// account takes as long as one for a real account (SDS 7.1).
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy password for unknown accounts');
  return dummyHash;
}
