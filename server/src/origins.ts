// Reads APP_ORIGIN, the comma-separated origins allowed to send state-changing requests
// (SDS 7.4). Outside production a missing value stops the API, so a gap in .env or CI is
// found at once. In production the API starts with an empty list and refuses every request
// that carries an Origin header until the deploy script sets the value. Each entry is
// normalized to scheme, host, and port, so a trailing slash still matches the browser's Origin.
export function parseAllowedOrigins(
  value: string | undefined,
  nodeEnv: string | undefined,
): string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(normalizeOrigin);

  if (origins.length === 0 && nodeEnv !== 'production') {
    throw new Error(
      'Set APP_ORIGIN to the origins of the web app, for example ' +
        'APP_ORIGIN="http://localhost:5190,http://127.0.0.1:5190".',
    );
  }
  return origins;
}

function normalizeOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw invalidOrigin(origin);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw invalidOrigin(origin);
  }
  return url.origin;
}

function invalidOrigin(origin: string): Error {
  return new Error(`APP_ORIGIN contains an invalid origin: ${origin}`);
}
