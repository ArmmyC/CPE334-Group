import {
  apiErrorSchema,
  currentUserSchema,
  healthResponseSchema,
  type CurrentUser,
  type HealthResponse,
  type LoginRequest,
} from '@cpe334-group/shared';

// An API error in the shared shape (SDS 5.3), with `fields` for validation errors.
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!response.ok) {
    const body = apiErrorSchema.safeParse(await response.json().catch(() => null));
    if (body.success) {
      const { code, message, fields } = body.data.error;
      throw new ApiRequestError(response.status, code, message, fields);
    }
    throw new ApiRequestError(
      response.status,
      'UNEXPECTED_RESPONSE',
      'Could not reach the server.',
    );
  }
  return response;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return healthResponseSchema.parse(await response.json());
}

// Returns the signed-in user, or null when there is no valid session (FR-03).
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const response = await send('/api/auth/me', { method: 'GET' });
    return currentUserSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function login(credentials: LoginRequest): Promise<CurrentUser> {
  const response = await send('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  return currentUserSchema.parse(await response.json());
}

// A 401 means the session was already gone, which is the outcome logout wants.
export async function logout(): Promise<void> {
  try {
    await send('/api/auth/logout', { method: 'POST' });
  } catch (error) {
    if (!(error instanceof ApiRequestError && error.status === 401)) {
      throw error;
    }
  }
}
