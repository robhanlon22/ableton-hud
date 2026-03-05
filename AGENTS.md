# AOSC Agent Operating Contract

## Purpose

- Execute repository tasks autonomously, safely, and verifiably.
- Prefer deterministic workflows and CI-parity checks over ad hoc local behavior.
- Keep instructions explicit, local, and enforceable.

## Autonomy Contract

- Execute end-to-end unless blocked by missing credentials, destructive-risk decisions, or unresolved product ambiguity.
- Do not stop at analysis when implementation is expected.
- When blocked, report:
  - exact blocker
  - what was already tried
  - the smallest next action needed from the user
- Use parallel work for independent exploration, but serialize edits that touch the same files.

## Execution Algorithm

1. Ground in repo truth first:

- inspect scripts/config/tests before changing code
- prefer existing patterns over inventing new ones

2. Make minimal, reversible edits:

- avoid broad rewrites unless required
- keep behavior-preserving changes behavior-preserving

3. Validate in risk order:

- run focused checks first
- run broader gates when touched surface warrants it

4. Report with evidence:

- list exact commands executed
- state what passed and what was not run

## Repo Map

- `src/main/`: Electron main process (window lifecycle, bridge, prefs, IPC handlers)
- `src/preload/`: `contextBridge` API surface (`window.hudApi`)
- `src/renderer/src/`: React UI and browser tests
- `src/shared/`: shared runtime schemas/types/contracts
- `e2e/`: Playwright Electron end-to-end tests + fake Ableton Live websocket server
- `out/`, `dist/`, `coverage/`, `test-results/`: generated artifacts (do not edit manually)

## Non-Negotiable Technical Rules

- TypeScript is strict. Keep explicit types where behavior/contracts are non-obvious.
- Keep IPC schema-first:
  - channels and schemas live in `src/shared/ipc.ts`
  - parse/validate inbound IPC payloads in main/preload
  - validate outbound HUD state before send
- For main-process IPC registration, remove before re-register:
  - `ipcMain.removeHandler(channel)` before `ipcMain.handle(channel, handler)`
- Keep bridge code injectable and fault-tolerant:
  - preserve dependency injection seams used by tests
  - route external Ableton access through safe wrappers/fallback behavior
- Do not hardcode duplicate protocol/channel constants outside shared contract files.

## Testing Rules

- Use runtime-specific Vitest file names only:
  - `*.browser.test.ts` / `*.browser.test.tsx`
  - `*.node.test.ts` / `*.node.test.tsx`
- Keep strict test structure in every test body:
  - `// arrange`
  - `// act`
  - `// assert`
- Coverage is strict and mandatory:
  - `pnpm test` runs with coverage by default
  - thresholds require 100% and per-file compliance
- Do not bypass coverage with ignore pragmas for runtime code.
- Use Vitest mocking primitives consistently:
  - `vi.fn()` for mocks/spies
  - `vi.stubEnv()` for env variables
  - `vi.stubGlobal()` for globals
- Do not manually clear/reset/restore/unstub mocks/env/globals in tests; config handles lifecycle.

## Browser Test Rules

- Prefer `render` from `vitest-browser-react`.
- Use Vitest browser locators and rich assertions:
  - `page.getBy*`, locator-based interactions/assertions
  - `toHaveTextContent`, `toHaveClass`, `toHaveAttribute`, `toBeInTheDocument`, etc.
- Avoid direct DOM scraping patterns when rich assertions exist:
  - no `document.querySelector` driven assertions
  - no manual `.textContent` / `.className` checks as first choice
  - no `parentElement` traversal for assertions
- Avoid custom wrapper helpers that obscure intent; keep selector/assertion intent inline in tests.

## E2E Rules

- E2E must be deterministic and not depend on a running local Ableton instance.
- Use fake websocket transport server from `e2e/fake-ableton-live-server.ts`.
- Launch compiled app entry (`out/main/index.js`) and isolate user/profile directories per test flow.
- Keep cleanup in `finally` blocks.
- Preserve serialized Playwright Electron execution unless harness architecture changes:
  - `workers: 1`
  - `fullyParallel: false`
  - `trace: retain-on-failure`

## Validation Matrix

- Fast local sanity (common):
  - `pnpm exec eslint .`
  - `pnpm exec tsc --noEmit`
  - `pnpm test`
- When touching Electron runtime/renderer bridge or e2e flows:
  - `pnpm run test:e2e`
- CI parity before merge (recommended full gate):
  - `pnpm install --frozen-lockfile`
  - `pre-commit run --all-files`
  - `pnpm test`
  - `pnpm run typecheck`
  - `pnpm run test:e2e`
- Release-surface changes:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm run test:e2e`
  - `pnpm dist:mac`

## Anti-Patterns

- Do not add plain `src/**/*.test.ts(x)` files that miss project globs.
- Do not mutate `process.env` directly in tests.
- Do not increase E2E parallelism without redesigning isolation/harness guarantees.
- Do not run raw Playwright commands as a substitute for canonical `pnpm run test:e2e` flow.
- Do not weaken coverage thresholds or add runtime coverage ignores to force passing CI.
- Do not hide failing checks; report failures with exact command and key error.

## Commit And PR Expectations

- Use concise, imperative commit messages.
- Keep commit scope coherent; avoid mixing unrelated refactors.
- Before push, ensure relevant gates pass.
- In PR summaries include:
  - scope and intent
  - commands run and results
  - screenshots/GIFs for visible UI changes

## Maintenance

- Keep this file synchronized with repo reality.
- If workflows, scripts, or test contracts change, update `AGENTS.md` in the same PR.
- Prefer adding narrowly scoped nested `AGENTS.md` files only when subtree rules diverge materially.
