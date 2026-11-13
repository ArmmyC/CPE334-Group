import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins } from '../src/origins.js';

describe('Supporting check: APP_ORIGIN parsing (SDS 7.4)', () => {
  it('splits and trims a comma-separated list', () => {
    expect(
      parseAllowedOrigins(' http://localhost:5190 , http://127.0.0.1:5190,', 'development'),
    ).toEqual(['http://localhost:5190', 'http://127.0.0.1:5190']);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['only commas and spaces', ' , '],
  ])('refuses to start outside production when APP_ORIGIN is %s', (_label, value) => {
    expect(() => parseAllowedOrigins(value, undefined)).toThrow(/APP_ORIGIN/);
    expect(() => parseAllowedOrigins(value, 'test')).toThrow(/APP_ORIGIN/);
  });

  it('normalizes each entry to its origin, so a trailing slash still matches', () => {
    expect(parseAllowedOrigins('http://localhost:5190/', 'development')).toEqual([
      'http://localhost:5190',
    ]);
  });

  it('refuses an entry that is not an http or https origin', () => {
    expect(() => parseAllowedOrigins('localhost:5190', 'development')).toThrow(/invalid origin/);
    expect(() => parseAllowedOrigins('not a url', 'development')).toThrow(/invalid origin/);
  });

  it('starts in production with an empty list, which refuses every Origin', () => {
    expect(parseAllowedOrigins(undefined, 'production')).toEqual([]);
    expect(parseAllowedOrigins('', 'production')).toEqual([]);
  });
});
