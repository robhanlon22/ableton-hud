# AOSC Architecture

## System Outline

Ableton HUD is a small Electron application with four core layers:

- `src/main/`: owns window lifecycle, preferences, IPC registration, and the
  Ableton bridge.
- `src/preload/`: exposes the typed `window.hudApi` bridge to the renderer.
- `src/shared/`: defines cross-process schemas and TypeScript contracts.
- `src/renderer/src/`: renders the HUD UI and browser-testable presentation
  logic.

Deterministic end-to-end coverage lives in `e2e/`, where Playwright launches
the compiled Electron app against `e2e/fake-ableton-live-server.ts` rather than
any local Ableton instance.

## Source Of Truth By Concern

- IPC contracts: `src/shared/ipc.ts`
- Shared runtime data shapes: `src/shared/types.ts`
- Electron startup and window behavior: `src/main/index.ts`
- Ableton transport and clip-state ingestion: `src/main/ableton-live-bridge.ts`
- Renderer composition and control behavior: `src/renderer/src/app/hud-app.tsx`
- Human-facing product behavior: `docs/product-specs/hud-behavior.md`
- Validation routing and evidence expectations: `docs/QUALITY.md`

## Key Invariants

- Every IPC contract change starts in `src/shared/ipc.ts`, then flows through
  main, preload, renderer, and tests.
- Main-process handlers must remove existing handlers before re-registering.
- The browser and Electron test harnesses stay deterministic. Do not replace the
  fake websocket transport with a live Ableton dependency in automated tests.
- User-visible behavior changes should update the product spec in the same PR.

## Change Recipes

### Renderer-only UI work

- Edit files under `src/renderer/src/`
- Update browser tests first when practical
- Run `pre-commit run --all-files`
- Use `pnpm test` locally when you want faster behavioral feedback than CI.

### IPC or bridge-contract work

- Start in `src/shared/`
- Update `src/main/` and `src/preload/`
- Add or adjust node/browser tests as needed
- Run `pre-commit run --all-files`
- Expect dedicated `test` and `e2e` CI jobs to cover the heavyweight checks.

### Ableton runtime or Electron window behavior

- Expect edits in `src/main/` and possibly `e2e/`
- Keep fallback behavior safe when the transport is disconnected
- Run `pre-commit run --all-files`
- Use `pnpm run test:e2e` locally only when you need immediate end-to-end
  feedback before CI.

### Release or packaging work

- Expect edits in build/package scripts or Electron packaging config
- Run `pre-commit run --all-files`
- Then run the explicit release commands you actually need, such as
  `pnpm run dist:mac`.

## Plan Artifacts

Use `docs/exec-plans/active/` for in-progress multi-step work and move finished
plans into `docs/exec-plans/completed/`. Track follow-up gaps in
`docs/exec-plans/tech-debt-tracker.md`.
