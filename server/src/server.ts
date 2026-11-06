import './config.js';
import { createApp } from './app.js';
import { systemClock } from './clock.js';
import { checkDatabase, prisma } from './db.js';
import { parseAllowedOrigins } from './origins.js';

const port = Number(process.env.PORT ?? 4100);
const production = process.env.NODE_ENV === 'production';

const app = createApp({
  prisma,
  checkDatabase,
  clock: systemClock,
  allowedOrigins: parseAllowedOrigins(process.env.APP_ORIGIN, process.env.NODE_ENV),
  secureCookies: production,
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
