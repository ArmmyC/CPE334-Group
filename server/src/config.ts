import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Load the repository-root .env without overriding variables that are already set,
// so `dotenv -e .env.test` and the deployment environment take precedence.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
