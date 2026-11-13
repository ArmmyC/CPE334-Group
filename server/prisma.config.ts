import { defineConfig } from 'prisma/config';

// Prisma 7 reads the connection string here, not in schema.prisma, and does not load .env itself.
// The root scripts load the env file with dotenv-cli. `prisma generate` runs from `npm ci` before
// any .env exists, so a missing DATABASE_URL must not stop it.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed-cli.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
