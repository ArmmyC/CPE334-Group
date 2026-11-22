# SR-08 Response Time Measurement

Product: Lab Equipment Borrowing System
Issue: to confirm (not created yet)
Owner: @ArmmyC (plan), drafted for the owner by Claude on 2026-11-22. Reviewer: teammate review pending.
Requirements: NFR-14, SR-08
Depends on: F-02 catalog, F-03 request list, a deployed application with seed data
Sources: [SRS](../../srs.md) NFR-14; [features](../../features.md) SR-08

## Version history

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | 2026-11-22 | draft for owner | First contract, written before tests. Contract only, not implemented in this round. Not yet reviewed by the teammate. |
| 0.2 | 2026-11-22 | draft for owner | Script and unit test implemented. Login values are read from `MEASURE_EMAIL` and `MEASURE_PASSWORD`. The statistics live in `scripts/percentile.mjs` so the unit test needs no network. The deployed-app run is still pending. |

## 1. Purpose

NFR-14 says the catalog and request list API responses take at most 1 second at the 95th percentile over 50 sequential requests on the deployed application with the seed data. This contract defines the measurement so the number is evidence, not a claim.

## 2. Measurement script

`scripts/measure-response-time.mjs`, Node only, no new dependency.

| Item | Rule |
| --- | --- |
| Input | `BASE_URL`, a test borrower email and password from environment variables. The script never prints them. |
| Steps | Log in once. Send 50 sequential `GET /api/equipment-types` requests, then 50 sequential `GET /api/requests` requests. Discard none. A first warm-up request is counted. |
| Timing | Wall time per request in milliseconds from send to the end of the body. |
| Output | For each endpoint: count, min, median, p95, max, and PASS when p95 <= 1000 ms, otherwise FAIL. The script exits non-zero on FAIL or any non-200 status. |
| p95 | The 48th smallest of 50 values (nearest-rank), stated in the output. |

## 3. Acceptance criteria

| AC | Requirements | Observable outcome |
| --- | --- | --- |
| AC-SR08-01 | NFR-14 | The script runs against the deployed application with seed data and prints PASS for both endpoints. |
| AC-SR08-02 | NFR-14 | The result (date, base URL host, counts, p95) is recorded in the Deliverable 2 and Lab 7 evidence. |
| AC-SR08-03 | NFR-14 | The percentile function is unit tested with fixed inputs (for example 1..50 gives 48). |

## 4. Test specifications

| Test | AC | Level | Expected result |
| --- | --- | --- | --- |
| TEST-SR08-01 | AC-SR08-03 | Unit | `p95` of 1..50 is 48, of one value is that value, unsorted input gives the same result. |
| TEST-SR08-02 | AC-SR08-01 | Manual, deployed | Script output with PASS and the host name. Cloud SQL must be running and the owner must say yes first. |

## 5. Not covered here

- Running against the deployed application needs the Cloud SQL instance started and the owner's approval. It was not run in this round.
- Local numbers are not a substitute for NFR-14, which names the deployed application.

## 6. Definition of Done

- The script and its unit test are merged. One recorded run on the deployed application shows PASS. (Pending, not started in this round.)
