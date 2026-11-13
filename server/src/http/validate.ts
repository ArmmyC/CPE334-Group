import { HttpError } from './errors.js';

// The part of a Zod schema this module needs, so the server does not depend on Zod's types.
type Schema<T> = {
  safeParse: (
    data: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
};

// Checks a request body with a shared schema. A failure becomes 400 VALIDATION_ERROR with
// the first message for each field (SDS 5.3). A missing body is checked as an empty object,
// so each required field gets its own message.
export function validateBody<T>(schema: Schema<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (result.success) {
    return result.data;
  }
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.map(String).join('.') || 'body';
    fields[field] ??= issue.message;
  }
  throw new HttpError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', fields);
}
