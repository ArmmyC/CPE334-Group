# AI-Use Declaration

This file lists the AI use in the Lab Equipment Borrowing System project, for the Sprint 1 release (`v0.1.0`). ArmmyC wrote the section for ArmmyC, and Bank848 wrote the section for Bank848.

The prompts below are copied from the session transcripts. They are short because most of the work was done by repeating a short instruction inside a longer session, with the plan, the contracts, and the review rules already in context.

## ArmmyC

| Date | Tool | Task assisted | Checked by |
| --- | --- | --- | --- |
| 2026-11-03 | Claude Code | Reading the project spec, comparing Theme 2 and Theme 4, and proposing the stack. | ArmmyC chose Theme 2 and the "Core set" of stack additions. |
| 2026-11-03 to 2026-11-05 | Claude Code | Drafting the SRS (#6), the feature inventory and traceability (#9), the System-Level SDS (#10), and the three-sprint plan (#11). | Bank848 reviewed and approved each pull request. |
| 2026-11-03 to 2026-11-06 | Claude Code | Application scaffold (#7), data model, constraints and seed (#13), and sign-in with session and current user, F-01 (#15). Each feature has its contract, then tests, then the code. | Bank848 approved each pull request. Lint, format, build, and tests pass. |
| 2026-11-07 | Claude Code | Borrow requests, F-03 (#17), and the F-05 contract with the SR-04 and SR-07 checks (#20). | Bank848 approved each pull request. |
| 2026-11-09 to 2026-11-13 | Claude Code, a second session acting as reviewer | Reviewing Bank848's pull requests (#25 to #31), drafting review comments, and posting them after ArmmyC approved the text. | ArmmyC approved the comments before each post, with "Post all five" and similar answers. Bank848 replied to the threads. |
| 2026-11-10 to 2026-11-11 | Claude Code with the humanizer skill | Rewriting the review comments and pull request text so they read plainly. | ArmmyC approved the text before posting. |
| 2026-11-13 | Claude Code | Active loan list, F-05 (#37), the F-04 follow-up (#38), and release preparation (#39). | Bank848 approved #37 and #38. #39 is waiting for his review. |
| 2026-11-13 | Claude Code, a second session | Running the three manual checks (SR-03-03, SR-04-01, SR-07-01) on `af54726` and writing them into the release pull request draft. | ArmmyC reads the draft before the release pull request is opened. |

## Representative prompts

| Date | Prompt | What it produced |
| --- | --- | --- |
| 2026-11-03 | "Read the spec in this folder and understand it" | A summary of the spec and its open points, such as the 10-minute and 4-minute demo video length. |
| 2026-11-03 | "I mean overall theme 2 vs 4" | A comparison of the two themes. ArmmyC then answered "let's do theme 2". |
| 2026-11-03 | "you can suggest more stack tho, if you have any recommendation" | A list of optional additions. ArmmyC answered "Core set", and the optional extras (TanStack Query, pino, zod-to-openapi) were declined. |
| 2026-11-03 | "can we use docker in wsl instead?" | The setup that runs the test databases in Docker inside WSL, now in the README. |
| 2026-11-07 | "Start F-03", then "Yes, write tests", "Start implementing", "Build the UI", "Open the PR" | The F-03 contract, then the failing tests, then the server, then the UI, then the pull request, in that order. |
| 2026-11-09 | "make another session as reviewer for reviewing bank pr" | A separate reviewer session that read Bank848's pull requests against the contracts. |
| 2026-11-13 | "reply to him telling him to merge, this is rule that we won't merge our own pr, note that in CLAUDE.md" | The merge rule in `CLAUDE.md`, and a comment on the pull request asking Bank848 to merge. |
| 2026-11-13 | "Start F-05", then "Yes, fix them" | The F-05 implementation on top of the merged contract, then the follow-up pull request #38 for the three items agreed on #28. |

## How the output was checked and corrected

- **Contracts before tests before code.** For each feature the contract is committed first, the tests next, and the tests are run and seen to fail before the implementation. The release pull request lists the three commit hashes for each feature.
- **Wrong output that was caught.**
  - The F-05 contract said only "200 with the active loans". SDS section 5 says list endpoints return `{ "items": [...] }`, so version 0.3 of the contract states that body, before the tests.
  - The F-04 test for AC-F04-09 counted `copy` rows. The criterion is about the catalog count, so the test now reads `availableCount` from `GET /api/equipment-types` (#38).
  - A client test for F-05 checked the table headers before the data loaded and failed. This was a bug in the test, not in the code, and the test now waits for the data first.
  - TEST-SR03-03 said a custodian can see the catalog. F-02 makes the catalog borrower only, so the wording was fixed (#39).
- **A process mistake.** #28 was merged after an approval with an empty diff, without checking the three items that were agreed when it was retargeted. The reviewer's changes arrived five minutes later. The items were added in #38, and the rule is now to check what was agreed before merging.
- **Rules kept outside the model.** Nobody merges their own pull request, and the other member reviews and merges. This is in `CLAUDE.md`, and the reviewer session and the author session follow it. Two earlier pull requests (#25 and #26) were merged by their author, and the release pull request says so.

## Bank848

| Date | Tool | Task assisted | Checked by |
| --- | --- | --- | --- |
| 2026-11-07 to 2026-11-13 | Claude Code | Sprint 1 feature work for F-07 (#25), F-02 (#26), F-06 (#27), and F-04 (#28): contract, tests, then code. | ArmmyC reviewed each pull request. Lint, format, build, and tests pass. |
| 2026-11-10 to 2026-11-13 | Claude Code | Lab 5 setup: CI gate and Docker image with `/api/ready` (#29), GCP resource and CI identity scripts (#30), and the deploy workflow, smoke test, and `deployment.md` (#31). | ArmmyC reviewed each pull request and asked for changes. #30 and #31 were fixed, re-reviewed, and approved. #29 is waiting for its retarget to `sprint-2`, so ArmmyC's changes-requested review stays until then. |
| 2026-11-12 to 2026-11-13 | Claude Code | Fixing ArmmyC's review points on #29 to #31, such as the tighter Workload Identity condition, the clean-folder check in the manual deploy script, keeping the smoke password out of command arguments, and the release procedure and rollback text. | ArmmyC re-read the changes and approved #30 and #31. |
| 2026-11-13 | Claude Code | Resolving merge conflicts on #28 and #29 after other pull requests merged into `sprint-1`. | `git diff` against the staging branch was empty for #28, and CI and local tests passed after the merge. |
| 2026-11-08 to 2026-11-13 | Claude Code | Reviewing ArmmyC's pull requests #17, #37, #38, and #39 against the contracts, with a local run of the tests and Playwright on each head. | Reviews were left as pending, read, and then submitted by Bank848. |
| 2026-11-13 | Claude Code | Reading the Google Cloud billing report, stopping the Cloud SQL instance when it was idle, and lowering the budget alert to 200 baht. | Bank848 asked for each step and checked the result in the Google Cloud console. |

### Representative prompts

| Date | Prompt | What it produced |
| --- | --- | --- |
| 2026-11-13 | "ไล่แก้จาก draft เป็น ready และก็ดูว่า pr ที่เปิดอยู่ทั้งหมดมี conflict ไหม" (mark the drafts ready and check every open pull request for conflicts) | #30 and #31 marked ready, and a conflict check on every open pull request. |
| 2026-11-13 | "แก้เลย แล้วเขียน deployment.md ด้วย" (fix it, and write deployment.md too) | The fixes for ArmmyC's points and `docs/labs/lab-05/deployment.md`. |
| 2026-11-13 | "รีวิว #17 เลย", then "ส่งรีวิวแบบ approve" (review #17, then submit it as approve) | A pending review with findings, then the approval after Bank848 read it. |
| 2026-11-13 | "รีวิว #37 กับ #38 เลย" (review #37 and #38) | Two pending reviews, each backed by a local test run, then submitted as approvals. |
| 2026-11-13 | "ประหยัดตังกันหน่อย" (let's save some money) | The stop and start steps for Cloud SQL, now in `deployment.md`. |

### How the output was checked and corrected

- **Tests run before approval.** For each pull request reviewed, the server, client, and Playwright tests were run locally against a real PostgreSQL database, not only read in CI. The reviewer also traced the claimed behaviour through the code.
- **Wrong output that was caught.**
  - A formatter run joined the line continuations in `infra/gcp/02-ci-identity.sh`. ArmmyC noticed, and the line breaks were restored and the other `infra/` files checked.
  - The first release procedure in `deployment.md` went straight from a pull request to `main`. ArmmyC pointed out that the plan uses a staging branch, a release pull request, and a version tag, and the text was rewritten.
  - The first cost figures in `deployment.md` had no source. ArmmyC asked for one, and the text now names the billing report and the date it was read.
- **Process mistakes.** #28 was merged by ArmmyC five minutes before the fixes for three review points were pushed: the catalog count test, the E2E request form, and the contract notes. They were fixed afterwards in the follow-up #38. Two earlier pull requests (#25 and #26) were merged by their author.
- **Rules kept outside the model.** Nobody merges their own pull request. Changes to billable cloud resources and to review submissions are done only after Bank848 asks for them, and secrets stay in files outside the repository.
