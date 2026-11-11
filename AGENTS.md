# sakuforge Repository Instructions

## Scope and source of truth

- Validation and aggregation are in `packages/core`. The language is TypeScript (`docs/decisions/0003-language-typescript.md`). The app is placed on Vercel with Next.js, and CSV inspection and aggregation run in a server function that returns JSON (`docs/decisions/0004-vercel-nextjs-server-side.md`). The design is in `docs/design.md`.
- `docs/` and the ADRs under `docs/decisions/` are the source of truth. Read `README.md` and the relevant files under `docs/` before making changes.
- The declaration and its axes are in `docs/decisions/0001-declaration-and-origin.md`. Judge every change against them; when in doubt, choose the option less likely to cause problems.
- This repository is public (`docs/decisions/0002-public-repository.md`). Never commit or post secrets, invitation passphrases, real data, stock master JSON, the content of individual replies from the Tokyo Stock Exchange, or personally identifying information.
- The origin is tfdata-api at `4a25bc93e8dba5b8bce866d6707bce6415ec61da`. Its Python code is a reference for comparing results only; do not copy it.

## Architecture

- Treat `docs/domain-rules.md` and `docs/input-trust-principles.md` as the source of truth for domain behavior and input handling.
- Write validation and aggregation as pure functions in TypeScript, with no side effects (no storage, network, clock, randomness, or logging). Put them in `packages/core`; it must not depend on the UI, React, or Next.js.
- Pass decimal values (amounts, share counts, composition ratios) as strings in and out of `packages/core`. Do not use binary floating point (`number`) for them.
- Server functions are limited to invitation checks and CSV inspection and aggregation (ADR 0004). Never store the CSV or its results on the server, and never write CSV content, asset values, or file names to logs, errors, or monitoring.
- Use the stock master only inside server functions. Do not send it to the browser.

## Git workflow

- Treat `docs/git-workflow.md` as the source of truth for branch, PR, and merge rules.
- Keep `main` as the only mainline. Do not commit or push changes directly to `main`.
- Respect the user's requested boundary for commit, push, PR, merge, and branch deletion; do not infer approval for a later external step. When no boundary is given, the β layer may merge a PR and clean up its branch only under the merge rule in `docs/layer-operations.md`.

## Human approval

The Issue workflow and development-layer procedures are in `docs/layer-operations.md`, read by the α and β layers. Do not merge a change that touches any of the following without human approval:

- `docs/decisions/`
- `docs/domain-rules.md`, `docs/input-trust-principles.md`, and `docs/external-data-policy.md`
- this file
- adding or updating dependencies
- CI and `.github/`
- invitation checks and secrets
- the stock master
- Vercel settings

## Change policy

- Make the smallest change that satisfies the request.
- Do not perform unrelated refactoring, renaming, dependency upgrades, or formatting.
- Inspect the working tree before editing and preserve unrelated or uncommitted user changes.
- Confirm versions and dependencies from repository files; do not guess.
- When behavior changes, update tests and relevant documentation in the same change.

## API and security rules

- Follow `docs/input-trust-principles.md` and `docs/external-data-policy.md`.
- Validate every input against `docs/input-trust-principles.md`, including the CSV, the stock master JSON, and every value a server function receives. Do not rely on checks in the browser.
- Return only fixed codes and fixed messages to users; do not embed exception strings, cell values, or file names.

## Required validation

Install dependencies with `pnpm install --frozen-lockfile`, then run these commands from the repository root:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Report commands exactly as run and do not claim unexecuted checks passed.

## Code review rules

These rules apply to review output, including Codex code reviews requested with `@codex review`.

- Write review comments and summaries in Japanese.
- For each finding, state the problem, its impact, and a proposed fix concisely.
- Keep code, identifiers, file paths, command names, and error messages in their original form.

## Completion report

Report:

- what changed and why;
- files and interfaces affected;
- checks executed and their results;
- checks not executed;
- compatibility impact, known limitations, and remaining risks.
