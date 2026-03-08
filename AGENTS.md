# AOSC Agent Operating Contract

## Start Here

- [`README.md`](README.md): product overview, developer commands, release workflow
- [`ARCHITECTURE.md`](ARCHITECTURE.md): runtime map, data flow, test harness surfaces
- [`docs/product-specs/README.md`](docs/product-specs/README.md): user-visible product contract
- [`docs/QUALITY.md`](docs/QUALITY.md): validation matrix, evidence requirements, mechanical gates
- [`docs/exec-plans/README.md`](docs/exec-plans/README.md): execution-plan format and lifecycle

## Purpose

- Execute repository tasks autonomously, safely, and verifiably.
- Prefer deterministic workflows and CI-parity checks over ad hoc local behavior.
- Keep repository guidance explicit, local, and enforceable.

## Repo Map

- `src/main/`: Electron main process, window lifecycle, prefs, IPC registration, Ableton bridge boot
- `src/preload/`: `contextBridge` API surface exposed as `window.hudApi`
- `src/renderer/src/`: React HUD UI and browser tests
- `src/shared/`: shared IPC schemas, runtime types, cross-process contracts
- `e2e/`: Playwright Electron tests plus fake Ableton Live websocket server
- `docs/`: quality gates, execution plans, screenshots, harness documentation

## Non-Negotiables

- Keep TypeScript strict and preserve explicit types where contracts are non-obvious.
- Keep the strict JSDoc gate intact:
  - document class declarations and expressions
  - document function declarations and expressions
  - document method definitions
  - document arrow functions
- Do not use `Reflect`; prefer explicit property access, direct assignment, or
  a typed adapter.
- Keep IPC schema-first:
  - channels and schemas live in `src/shared/ipc/index.ts`
  - validate inbound IPC payloads in main/preload
  - validate outbound HUD state before send
- For main-process IPC registration, call `ipcMain.removeHandler(channel)` before re-registering.
- Preserve dependency-injection seams in the Ableton bridge and preload surfaces.
- Do not duplicate protocol/channel constants outside shared contract files.

## Testing Rules

- Use runtime-specific Vitest names only:
  - `*.browser.test.ts` / `*.browser.test.tsx`
  - `*.node.test.ts` / `*.node.test.tsx`
- Keep every test body in `// arrange`, `// act`, `// assert` order.
- `pnpm test` retains 100% coverage with per-file thresholds; do not bypass this with coverage ignores.
- Browser tests should prefer `render` from `vitest-browser-react` and locator-driven assertions.
- E2E must stay deterministic:
  - use `e2e/fake-ableton-live/server.ts`
  - launch `out/main/index.js`
  - isolate user/profile directories
  - keep `workers: 1`, `fullyParallel: false`, `trace: retain-on-failure`

## Validation And Reporting

- Run the smallest useful checks first, then escalate to broader gates based on touched surface.
- Use [`docs/QUALITY.md`](docs/QUALITY.md) as the source of truth for command selection.
- Report exact commands run, what passed, and what was intentionally not run.
- For visible UI changes, include screenshot or GIF evidence in the PR/report.

## Harness Docs

- Treat these files as part of the product surface:
  - `AGENTS.md`
  - `README.md`
  - `ARCHITECTURE.md`
- `docs/QUALITY.md`
- `docs/product-specs/*`
- `docs/exec-plans/*`
- When workflow, scripts, architecture, or test contracts change, update the affected docs in the same patch.
- `pre-commit run --all-files` must pass after doc/process changes.
