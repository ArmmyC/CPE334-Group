import { fileURLToPath } from 'node:url';
import './config.js';
import { createApp } from './app.js';
import { systemClock } from './clock.js';
import { checkDatabase, checkReady, prisma } from './db.js';
import { getDummyHash } from './auth/password.js';
import { parseAllowedOrigins } from './origins.js';

const port = Number(process.env.PORT ?? 4100);
const production = process.env.NODE_ENV === 'production';

const app = createApp({
  prisma,
  checkDatabase,
  checkReady,
  clock: systemClock,
  allowedOrigins: parseAllowedOrigins(process.env.APP_ORIGIN, process.env.NODE_ENV),
  secureCookies: production,
  // The image holds client/dist next to server/dist (SDS 10). CLIENT_DIR overrides it.
  clientDir:
    process.env.CLIENT_DIR ??
    (production ? fileURLToPath(new URL('../../client/dist', import.meta.url)) : undefined),
});

// Builds the dummy hash before the first request, so the first unknown-email login takes
// the same time as any other login.
await getDummyHash();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
