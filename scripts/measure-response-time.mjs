// SR-08 / NFR-14: 50 sequential requests to the catalog and to the request list, p95 under 1 second.
//
//   BASE_URL=https://host MEASURE_EMAIL=... MEASURE_PASSWORD=... node scripts/measure-response-time.mjs
//
// The login values come only from the environment and are never printed. The script logs in once,
// then sends 50 requests to each endpoint one after the other, timing each from send to the end of
// the body. The warm-up request is counted. It exits 1 when p95 is over the limit or any answer is
// not 200, and 2 when the setup is wrong.
import { summarize } from './percentile.mjs';

const REQUESTS = 50;
const LIMIT_MS = 1000;
const ENDPOINTS = ['/api/equipment-types', '/api/requests'];

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

const base = process.env.BASE_URL;
const email = process.env.MEASURE_EMAIL;
const password = process.env.MEASURE_PASSWORD;
if (!base || !email || !password) {
  fail('Set BASE_URL, MEASURE_EMAIL and MEASURE_PASSWORD (a borrower account).');
}
const origin = new URL(base).origin;

const login = await fetch(`${origin}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (login.status !== 200) fail(`Login failed with status ${login.status}.`);
const cookie = login.headers
  .getSetCookie()
  .find((value) => value.startsWith('sid='))
  ?.split(';')[0];
if (!cookie) fail('Login gave no session cookie.');

let failed = false;
console.log(`SR-08 response time, host ${new URL(origin).host}, ${new Date().toISOString()}`);
console.log(`p95 = the 48th smallest of ${REQUESTS} (nearest-rank), limit ${LIMIT_MS} ms`);

for (const path of ENDPOINTS) {
  const times = [];
  const statuses = new Set();
  for (let i = 0; i < REQUESTS; i += 1) {
    const start = performance.now();
    const response = await fetch(`${origin}${path}`, { headers: { Cookie: cookie } });
    await response.arrayBuffer();
    times.push(performance.now() - start);
    statuses.add(response.status);
  }
  const stats = summarize(times, LIMIT_MS);
  const allOk = statuses.size === 1 && statuses.has(200);
  const verdict = stats.pass && allOk ? 'PASS' : 'FAIL';
  if (verdict === 'FAIL') failed = true;
  const ms = (value) => `${value.toFixed(1)} ms`;
  console.log(
    `${verdict} GET ${path}: count ${stats.count}, min ${ms(stats.min)}, median ${ms(stats.median)}, ` +
      `p95 ${ms(stats.p95)}, max ${ms(stats.max)}, statuses ${[...statuses].join(',')}`,
  );
}

process.exit(failed ? 1 : 0);
