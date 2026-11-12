---
name: verify
description: Use when a code change in apps/web (the web app) is finished or about to be called done, fixed, or passing; before committing, pushing, or opening a GitHub PR; or when the user asks to verify, check, or prove the work.
---

# Verify web changes

**Done is the gates run and observed, with the results stated explicitly.** A green test run alone is not done: a weakened test passes by design, so the diff must be read too.

## Procedure

Run from `apps/web/`.

1. **Gates.** Run every gate, even if one fails, and read each output.

   ```bash
   pnpm exec eslint .                # no --fix: observe, don't rewrite
   pnpm run format:check             # no --write: observe, don't rewrite
   pnpm exec tsc --noEmit
   pnpm run build                    # next build: stop `next dev` first; needs NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   pnpm run test
   ```

   - Inside the `/work-ticket` workflow, replace `pnpm run test` with the app's `coverage` command in `../../.claude/workflow.json` (`node ../../.claude/scripts/config.mjs get apps.web.coverage`) and write the test report afterwards (`../../.claude/rules/workflow.md` §7).
   - A missing `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` makes Build `FAIL` with that reason.

2. **E2E.** There is no web e2e suite. Always report the row `E2E tests | n/a | no web e2e suite; UI shown by screenshots (workflow rule 9)`.

3. **Read the diff.** Use `git diff BASE`, where `BASE` is the base commit (in `/work-ticket`, the plan's), the commit before your first one, or `HEAD` when nothing is committed: it shows staged and unstaged changes, and the autofix stages the files it touches. Run `git status --short` too, and read untracked files in full. Check:
   - **Scope:** every hunk was requested, and nothing outside the task changed.
   - **Test integrity:**
     - no `.skip`, `.only` or `.todo` added;
     - no `expect(` removed;
     - no loosened matcher;
     - no expected value edited to match new output;
     - no test file deleted;
     - no `jest.config.ts` or `jest.setup.ts` change;
     - no narrowed test path passing only through `--passWithNoTests`.
   - **Suppressions:** no `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `console.log` or `debugger` added.
   - **Conventions (`.claude/rules/coding.md`, `.claude/rules/testing.md`):**
     - no literal API URL or `/api/v1` outside the `API_ROUTES` and `API_BASE_URL` definitions in `src/constants/routes.ts`;
     - no literal error, success or dialog message added;
     - no redeclared shared enum or payload type;
     - no `'use client'` added to a `page.tsx` or `layout.tsx`;
     - no public read without `skipAuth`;
     - no secret in a `NEXT_PUBLIC_*` variable;
     - no new `dangerouslySetInnerHTML`;
     - no form control without an accessible name.

   An item may be legitimate. If it is, state why in the report. See [reference.md](reference.md#checklist-details).

4. **Fix and rerun.** On any failure or checklist hit, fix the cause, then rerun all gates. Never get to green with:
   - `--no-verify`;
   - `.skip` or `.only`;
   - a narrower Jest path or `testPathIgnorePatterns`;
   - `eslint-disable`, `@ts-ignore` or `@ts-expect-error`;
   - expected values edited to match new output.

5. **Report.** Use the shape below. Every row comes from runs made after your last edit.

   ```markdown
   ## Verification

   | Gate           | Result | Evidence                                                    |
   | -------------- | ------ | ----------------------------------------------------------- |
   | Lint           | PASS   | 0 errors, 9 warnings (unchanged)                            |
   | Format         | PASS   | prettier --check: all files formatted                       |
   | Type check     | PASS   | tsc --noEmit exit 0                                         |
   | Build          | PASS   | next build exit 0, next dev stopped                         |
   | Unit tests     | PASS   | 81 suites, 600 tests passed                                 |
   | E2E tests      | n/a    | no web e2e suite; UI shown by screenshots (workflow rule 9) |
   | Diff review    | PASS   | 3 files, all in scope                                       |
   | Test integrity | PASS   | no skipped tests, no assertions removed                     |

   **Verdict: PASS** — <one line on what was verified>
   ```

   - A `SKIPPED` row always has a reason.
   - An accepted checklist hit goes in the Evidence column with its justification.
   - Any `FAIL` makes the verdict `FAIL`.

## Red flags: stop and rerun

| Thought                                             | Reality                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| "Tests pass, so nothing was weakened"               | A weakened test passes by design. Read the test diff.                             |
| "Tests passed earlier"                              | An edit after that run invalidates it. Rerun.                                     |
| "Build passed earlier while `next dev` was running" | Both write `.next`. Stop `next dev` and rerun the build.                          |
| "Only a small change, the build is enough"          | Lint, format and tests are their own gates, and CI runs the tests. Run all gates. |
| "I'll update the expectation so it passes"          | First prove the requirement changed. Otherwise the code is wrong.                 |
| "The UI looks fine, I'll mark E2E PASS"             | There is no web e2e suite. The row is n/a; screenshots show the UI.               |

Gate details, checklist details and known noise are in [reference.md](reference.md).
