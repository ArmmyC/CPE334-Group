import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.js';

describe('Supporting check: password hash format (SDS 7.1)', () => {
  it('stores scrypt parameters, a 16-byte salt, and a 64-byte key', async () => {
    const stored = await hashPassword('correct horse battery');
    const [scheme, n, r, p, salt, hash] = stored.split('$');

    expect([scheme, n, r, p]).toEqual(['scrypt', '16384', '8', '1']);
    expect(Buffer.from(salt, 'base64')).toHaveLength(16);
    expect(Buffer.from(hash, 'base64')).toHaveLength(64);
    expect(
      scryptSync('correct horse battery', Buffer.from(salt, 'base64'), 64, {
        N: 16384,
        r: 8,
        p: 1,
      }).toString('base64'),
    ).toBe(hash);
  });

  it('gives different hashes for the same password', async () => {
    const first = await hashPassword('correct horse battery');
    const second = await hashPassword('correct horse battery');

    expect(first).not.toBe(second);
  });
});

describe('TEST-F01-05 password verification (AC-F01-05, NFR-01)', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse battery');

    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it.each([
    ['an empty string', ''],
    ['another scheme', 'bcrypt$10$abc'],
    ['missing parts', 'scrypt$16384$8$1$c2FsdA=='],
    ['non-numeric parameters', 'scrypt$N$8$1$c2FsdA==$aGFzaA=='],
    ['an empty key', 'scrypt$16384$8$1$c2FsdA==$'],
    ['the seed fixture placeholder', 'scrypt$16384$8$1$fixture$fixture'],
  ])('returns false for %s without throwing', async (_label, stored) => {
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(false);
  });
});
