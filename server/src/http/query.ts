import { HttpError } from './errors.js';
import { validateBody } from './validate.js';

type Schema<T> = Parameters<typeof validateBody<T>>[0];

// SDS 5.1: an unknown query parameter is refused, then the known ones are checked with the shared
// schema. A repeated parameter arrives as an array and fails the text check.
export function checkQuery<T>(
  schema: Schema<T>,
  allowed: string[],
  query: Record<string, unknown>,
): T {
  const unknown = Object.keys(query).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Check the highlighted fields.',
      Object.fromEntries(unknown.map((name) => [name, 'Unknown parameter.'])),
    );
  }
  return validateBody(schema, query);
}
