// Password for every seeded account in the E2E test database only. It is not a secret:
// the test database holds synthetic data and is reset before every E2E run.
export const e2ePassword = 'e2e-password-for-tests';

export const seededBorrower = { email: 'borrower1@example.com', name: 'Arisa Kittipong' };

export const seededCustodian = { email: 'custodian.embedded@example.com', name: 'Napat Srisuk' };
