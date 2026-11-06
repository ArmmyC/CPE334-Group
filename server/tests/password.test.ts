import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';

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
