# sakuforge Repository Instructions

## Scope and source of truth

- No application code exists yet. The language is undecided and will be chosen in ADR 0003 or later.
- `docs/` and the ADRs under `docs/decisions/` are the source of truth. Read `README.md` and the relevant files under `docs/` before making changes.
- The declaration and its axes are in `docs/decisions/0001-declaration-and-origin.md`. Judge every change against them; when in doubt, choose the option less likely to cause problems.
- This repository is public (`docs/decisions/0002-public-repository.md`). Never commit or post secrets, invitation passphrases, real data, stock master JSON, the content of individual replies from the Tokyo Stock Exchange, or personally identifying information.
- The origin is gunji-m/tfdata-api at `4a25bc93e8dba5b8bce866d6707bce6415ec61da`. Its Python code is a reference for comparing results only; do not copy it.

## Architecture

- Treat `docs/domain-rules.md` and `docs/input-trust-principles.md` as the source of truth for domain behavior and input handling.
- Write validation and aggregation as pure functions in a single language. Concrete architecture rules will be added after the language is decided.

## Git workflow

- Treat `docs/git-workflow.md` as the source of truth for branch, PR, and merge rules.
- Keep `main` as the only mainline. Do not commit or push changes directly to `main`.
- Start Issue work from an up-to-date, clean `main` on a short-lived `<type>/<issue-number>-<short-description>` branch, using `feat`, `fix`, `docs`, `test`, or `chore` as the type.
- Validate locally, open a PR to `main`, bring the branch up to date with `main`, confirm checks and self-review, then merge with a merge commit (no squash or rebase merge). Do not rewrite a branch after its PR is opened (no rebase, amend, or force push). Confirm the resulting `main` before cleanup.
- Delete merged short-lived branches locally and remotely after verifying the PR and `main`. Do not introduce `develop`, long-lived `release/*`, or GitFlow without an explicit new decision.
- Respect the user's requested boundary for commit, push, PR, merge, and branch deletion; do not infer approval for a later external step.

## Issue workflow

The canonical rules are `templates/github/issue-operations.md` in gunji-m/agent-workflows (synced 2026-10-31). This section holds only the key points and repository-specific notes. The templates under `.github/` are copies; change the canonical file first.

- Issues are the entry point for work. Use the four templates in `.github/ISSUE_TEMPLATE/`: 進行 (progress), 開発 (development), 検証 (validation), and タスク (task).
- Give each Issue exactly one type label: `進行管理`, `開発`, `検証`, or `タスク`. Give each open work Issue at most one status label: `次の作業`, `作業中`, `データ待ち`, `ユーザー確認待ち`, or `保留`. Do not put status labels on progress Issues. Mark unadopted hypotheses with `検討候補`.
- Do not put type markers such as `[計画]` in titles. When changing a status label, update the Issue body's current state and resume notes at the same time.
- When splitting work, use progress → development/validation → task. Do not split small changes. Do not close a parent because one child is done.
- On completion, close the Issue, remove its status label, and keep its type label.

Repository-specific notes:

- `docs/git-workflow.md` remains the source of truth for branches, PRs, merges, and completion.
- Use `データ待ち` when waiting for external data such as the monthly TSE listed-stock file.
- Do not write personally identifying information in Issues. Paste only synthetic data.

## Change policy

- Make the smallest change that satisfies the request.
- Do not perform unrelated refactoring, renaming, dependency upgrades, or formatting.
- Inspect the working tree before editing and preserve unrelated or uncommitted user changes.
- Confirm versions and dependencies from repository files; do not guess.
- When behavior changes, update tests and relevant documentation in the same change.

## API and security rules

- Follow `docs/input-trust-principles.md` and `docs/external-data-policy.md`. Concrete rules will be added after the language is decided.

## Required validation

Validation commands will be defined after the language is decided.
Report commands exactly as run and do not claim unexecuted checks passed.

## Code review rules

These rules apply to review output, including Codex code reviews requested with `@codex review`.

- Write review comments and summaries in Japanese.
- For each finding, state the problem, its impact, and a proposed fix concisely.
- Keep code, identifiers, file paths, command names, and error messages in their original form.
- Judge changes against the rules in this file and the documents under `docs/`.

## Completion report

Report:

- what changed and why;
- files and interfaces affected;
- checks executed and their results;
- checks not executed;
- compatibility impact, known limitations, and remaining risks.
