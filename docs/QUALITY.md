# Quality Gates

Use this file as the source of truth for validation routing and reporting.

## Gate Selection

### Docs or harness changes

- Run `pre-commit run --all-files`
- CI lint runs the same command with `SKIP=test-suite` because `pnpm test`
  already has a dedicated CI job.

### Electron runtime, preload, renderer bridge, or e2e harness changes

- Run `pre-commit run --all-files`
- Run `pnpm test` or `pnpm run test:e2e` locally when you need faster feedback
  than waiting for CI.

### Release-surface changes

- Run `pre-commit run --all-files`
- Then run the explicit release validation you need, such as `pnpm run dist:mac`.

### Pre-commit breakdown

- `pre-commit run --all-files`
  - `node ./scripts/validate-harness-docs.mjs`
  - `pnpm exec prettier --write --ignore-unknown`
  - `pnpm exec eslint --fix`
  - `pnpm exec tsc --noEmit`
  - `pnpm test`

### CI jobs

- `lint.yml`
  - runs `pre-commit run --all-files` with `SKIP=test-suite`
- `test.yml`
  - runs `pnpm test`
- `e2e.yml`
  - runs `pnpm run test:e2e`

## Evidence Expectations

- Report exact commands run.
- State what passed, what failed, and what was intentionally not run.
- For visible UI changes, include screenshot or GIF evidence.
- For Electron end-to-end coverage, keep the fake Ableton websocket server as
  the transport source.

## Harness Docs

- The agent-facing contract spans `AGENTS.md`, `README.md`, `ARCHITECTURE.md`,
  `docs/QUALITY.md`, `docs/product-specs/*`, and `docs/exec-plans/*`.
- When this contract changes, update the relevant docs in the same patch and
  rerun `pre-commit run --all-files`.
