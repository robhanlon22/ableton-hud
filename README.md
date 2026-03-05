# Ableton HUD

Desktop timing HUD for Ableton Live via [AbletonOSC](https://github.com/ideoforms/AbletonOSC).

It follows the selected track's currently playing Session slot/clip and shows a compact musical counter UI.

## Current Feature Set

- Musical counter in `Bar:Beat:16th` format.
- Toggle between:
  - `Elapsed` mode (counts up from launch or loop start)
  - `Remaining` mode (counts down to clip end or loop end)
- Last-bar warning color behavior.
- Beat flash animation with stronger emphasis on downbeat.
- Header metadata pills:
  - clip name
  - track name
  - scene name
- Each metadata pill uses Ableton-provided color (with auto-contrast text).
- Status icon badge (icon-only): playing, stopped, disconnected.
- Float/normal toggle (always-on-top on/off).
- Resizable window with persisted position and content size.
  - default content size: `370x180`
  - native full-width macOS title bar.
- Clip handoff smoothing to avoid brief no-clip flicker during track transitions.

Notes:

- No loop-cycle counter is displayed.
- Empty metadata names still render as empty pills (for stable visual layout).

## Requirements

- macOS
- Ableton Live with AbletonOSC installed and running
- Node.js 22+

## OSC Assumptions

Ports are hardcoded:

- AbletonOSC receive: `127.0.0.1:11000`
- HUD listen: `127.0.0.1:11001`

## Development

```bash
pnpm install
pnpm run dev
```

## Debug Dev Mode

```bash
pnpm run dev:debug
```

This auto-selects free ports (starting from the values below):

- Main process inspector: `9230` (override start with `AOSC_MAIN_DEBUG_PORT`)
- Renderer CDP (DevTools protocol): `9222` (override start with `AOSC_RENDERER_DEBUG_PORT`)

## Validation

```bash
pnpm test
pnpm run typecheck
pnpm run build
```

`pnpm test` runs:

- node timing/counter tests
- jsdom renderer component tests

## Playwright Electron E2E

```bash
pnpm install
pnpm run test:e2e
pnpm run test:e2e:headed
```

These tests run against the built Electron app and use deterministic injected HUD state.
Ableton Live/AbletonOSC are not required for CI E2E.

On failure, Playwright outputs are expected in:

- `test-results/playwright`
- `playwright-report`

## Build macOS `.app`

```bash
pnpm run dist:mac
```

This runs a universal (`--universal`) macOS dir build via `electron-builder`.
Expected output is in `dist/` (for example `dist/mac-universal/Ableton HUD.app`).

The app is unsigned. First launch may require Control-click -> Open in Finder.

## Automated Releases (GitHub Actions)

Cut a tag locally and push it to trigger the release workflow:

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

The workflow uploads:

- universal macOS zip artifact
- matching `.sha256` checksum file

Release runs are immutable: if a release for that tag already exists, the workflow fails instead of replacing assets. Use a new version tag for retries.

Additional CI workflows:

- `Lint`: runs `pre-commit run --all-files` on pull requests and pushes to `main`
- `Test`: runs `pnpm test` on pull requests and pushes to `main`
- `E2E`: runs `pnpm run test:e2e` on pull requests and pushes to `main` (macOS)
