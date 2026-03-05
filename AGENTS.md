# Repository Guidelines

## Project Structure & Module Organization

- `src/main/`: Electron main process logic (window lifecycle, OSC bridge, preferences).
- `src/preload/`: `contextBridge` API exposed to renderer (`window.hudApi`).
- `src/renderer/src/`: React UI (`app/`, `components/ui/`, `lib/`, test setup).
- `src/shared/`: Shared runtime types/schemas used across main/preload/renderer.
- `e2e/`: Playwright Electron end-to-end tests.
- Build outputs are in `out/` (runtime) and `dist/` (packaging artifacts); do not edit generated files.

## Build, Test, and Development Commands

- `pnpm dev`: Run Electron + Vite in development mode.
- `pnpm dev:debug`: Dev mode with debug script helpers.
- `pnpm build`: Build main/preload/renderer bundles to `out/`.
- `pnpm test`: Run Vitest unit/integration tests with coverage enforcement.
- `pnpm run test:e2e`: Build app, then run Playwright Electron E2E tests.
- `pnpm run typecheck`: Run TypeScript checks (`tsc --noEmit`).
- `pnpm run dist:mac`: Produce macOS distributable directory.

## Coding Style & Naming Conventions

- Language: TypeScript (strict). Use 2-space indentation and ES module syntax.
- Follow ESLint config in `eslint.config.mts` (`typescript-eslint`, `jsdoc`, `tsdoc`, `perfectionist`).
- Prefer descriptive, explicit names (`createDefaultHudState`, `handleSelectedTrack`).
- Keep comments minimal but meaningful; add TSDoc/JSDoc for non-obvious exported behavior.
- Test files: `*.test.ts` / `*.test.tsx` colocated with source areas.

## Testing Guidelines

- Frameworks: Vitest + Testing Library (unit/integration), Playwright (Electron E2E).
- Coverage is mandatory and strict: `coverage.thresholds.{100:true, perFile:true}` in `vitest.config.ts`.
- Do not bypass coverage with ignore pragmas for runtime code; improve design/tests instead.
- Test structure is strict: always follow `arrange -> act -> assert` in that order.
- Tests and test data must be branch-free where possible: avoid conditional logic in test bodies/fixtures; use explicit, fixed assertions.
- Use Vitest mocking primitives consistently:
  - `vi.fn()` for spies/mocks (not ad hoc inline functions).
  - `vi.stubGlobal()` for globals (instead of `Object.defineProperty(window, ...)`).
  - `vi.stubEnv()` for environment variables (instead of mutating `process.env` directly).
- Typical local gate:
  - `pnpm exec eslint .`
  - `pnpm exec tsc --noEmit`
  - `pnpm test`

## Commit & Pull Request Guidelines

- Use concise, imperative commit messages (examples in history: `Add ...`, `Enable ...`, `Enforce ...`).
- Optional prefixes like `chore:` are acceptable for maintenance changes.
- Before pushing, ensure pre-commit hooks pass (Prettier, ESLint, TypeScript).
- PRs should include:
  - Clear scope summary.
  - Verification commands run and results.
  - Screenshots/GIFs for UI changes and notes for workflow/config updates.
