# CPE334 Group Project: Lab Equipment Borrowing System

CPE 334 Semester 1/2026 group project, Theme 2: Inventory and Borrowing.

The CPE department lends lab equipment (laptops, development boards, oscilloscopes, cameras) to students. Borrowers request available copies, and custodians record checkout, return, and overdue status.

## Team

| GitHub | Role in this repository |
| --- | --- |
| @ArmmyC | Developer and reviewer |
| @Bank848 | Developer and reviewer |

Both students share requirements, design, testing, implementation, review, deployment, and maintenance work.

## Status

Repository setup. The application scaffold, setup commands, and test commands will be added by the scaffold Issue.

## Planned stack

- UI: React, Vite, React Router, Bootstrap
- API: Node.js, Express 5, Zod validation
- Database: PostgreSQL with Prisma migrations and seed data
- Tests: Vitest, Supertest, Playwright
- Delivery: Docker, GitHub Actions, GCP (from Lab 5)

## Engineering documents

| Document | Path |
| --- | --- |
| Software Requirements Specification | [docs/srs.md](docs/srs.md) |
| Feature inventory | [docs/features.md](docs/features.md) |
| Traceability matrix | [docs/traceability.md](docs/traceability.md) |
| System-Level SDS | [docs/system-sds.md](docs/system-sds.md) |
| Three-sprint plan | [docs/sprints/plan.md](docs/sprints/plan.md) |
| Sprint 1 contracts | [docs/sprints/sprint-1/](docs/sprints/sprint-1/) |
| AI-use declaration | [docs/ai-use.md](docs/ai-use.md) |

## Workflow

1. Open an Issue linked to its requirement, feature, and contract.
2. Branch from the current sprint staging branch (`sprint-1`).
3. Open a Pull Request into the staging branch and link it to the Issue.
4. The teammate reviews and merges. Authors do not approve or merge their own PRs.
5. A reviewed release PR moves the staging branch into `main`, and the release is tagged.

Do not commit real secrets. Copy `.env.example` to `.env` for local configuration.
