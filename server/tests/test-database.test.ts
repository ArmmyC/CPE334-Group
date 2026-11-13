import { describe, expect, it } from 'vitest';
import { assertTestDatabaseUrl } from '../src/test-database.js';

describe('assertTestDatabaseUrl', () => {
  it('accepts a database name ending in _test', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://user:pass@localhost:5436/cpe334_group_test?schema=public',
      ),
    ).not.toThrow();
  });

  it.each([
    ['the development database', 'postgresql://user:pass@localhost:5435/cpe334_group'],
    ['a missing URL', undefined],
    ['a malformed URL', 'not a url'],
  ])('refuses %s', (_label, databaseUrl) => {
    expect(() => assertTestDatabaseUrl(databaseUrl)).toThrow(/ends in _test/);
  });
});
