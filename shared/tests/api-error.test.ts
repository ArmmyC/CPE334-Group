import { describe, expect, it } from 'vitest';
import { apiError, apiErrorSchema } from '../src/api-error.js';

describe('apiError', () => {
  it('builds an error without fields when none are given', () => {
    const body = apiError('NOT_FOUND', 'Route not found.');

    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
  });

  it('includes field messages for validation errors', () => {
    const body = apiError('VALIDATION_FAILED', 'Check the highlighted fields.', {
      email: 'Enter an email address.',
    });

    expect(body.error.fields).toEqual({ email: 'Enter an email address.' });
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
  });

  it('rejects a body without a code', () => {
    expect(apiErrorSchema.safeParse({ error: { message: 'x' } }).success).toBe(false);
  });
});
