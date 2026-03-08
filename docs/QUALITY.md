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
- `pnpm test` shuffles file order and intra-file test order; rerun with
  `VITEST_SEQUENCE_SEED=<seed> pnpm test` to reproduce an order-dependent
  failure from a prior run.

### Release-surface changes

- Run `pre-commit run --all-files`
- Then run the explicit release validation you need, such as `pnpm run dist:mac`.

### Pre-commit breakdown

- `pre-commit run --all-files`
  - `node ./scripts/validate-harness-docs.mjs`
  - `pnpm exec prettier --write --ignore-unknown`
  - `pnpm run lint:fix`
  - `pnpm exec tsc --noEmit`
- `pnpm test`
  - runs Vitest with shuffled file and test order
  - replay a specific order with `VITEST_SEQUENCE_SEED=<seed> pnpm test`

### Manual lint commands

- `pnpm run lint`
  - zero-warning strict lint gate for local verification and CI parity
- `pnpm run lint:fix`
  - autofix-first entry point used by pre-commit before typecheck and tests
- `pnpm test`
  - coverage gate with randomized order and a logged shuffle seed

### CI jobs

- `lint.yml`
  - runs `pre-commit run --all-files` with `SKIP=test-suite`
- `test.yml`
  - runs `pnpm test` on `ubuntu-latest`, `windows-latest`, and `macos-latest`
- `e2e.yml`
  - runs `pnpm run test:e2e` on `ubuntu-latest`, `windows-latest`, and
    `macos-latest`
  - Linux legs run the Electron suite through `xvfb-run`
- `release.yml`
  - validates test, typecheck, Electron E2E, and release builds on
    `ubuntu-latest`, `windows-latest`, and `macos-latest`
  - runs on pull requests, `main`, tags, and manual dispatches
  - tag publishes remain macOS-universal only until Linux/Windows release
    artifacts are productized

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
