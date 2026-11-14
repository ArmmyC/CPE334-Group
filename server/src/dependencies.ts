import type { PrismaClient } from '@prisma/client';
import type { Clock } from './clock.js';

// Everything the app takes from outside, so tests can pass a fixed clock or another database.
export type AppDependencies = {
  prisma: PrismaClient;
  checkDatabase: () => Promise<void>;
  // Rejects until the database answers and every migration is applied (GET /api/ready).
  checkReady: () => Promise<void>;
  clock: Clock;
  // Origins allowed to send state-changing requests (APP_ORIGIN, SDS 7.4).
  allowedOrigins: readonly string[];
  // Adds Secure to the session cookie. True when NODE_ENV=production.
  secureCookies?: boolean;
  healthTimeoutMs?: number;
  // Folder with the built client (client/dist). When set, the server also serves the SPA.
  clientDir?: string;
};
