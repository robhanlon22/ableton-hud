# Ableton HUD

[![CI](https://github.com/robhanlon22/ableton-hud/actions/workflows/ci.yml/badge.svg)](https://github.com/robhanlon22/ableton-hud/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/robhanlon22/ableton-hud/graph/badge.svg?token=RQD6XR5RGA)](https://codecov.io/gh/robhanlon22/ableton-hud)
[![Playwright Report](https://img.shields.io/badge/Playwright%20Report-GitHub%20Pages-0969da)](https://robhanlon22.github.io/ableton-hud/)

A small desktop HUD for Ableton Live that shows the current clip position in
`Bar:Beat:16th` and stays readable in an always-on-top window.

> [!IMPORTANT]
> Ableton HUD depends on the upstream `ableton-live` Max device.
> The upstream bridge README lists `Ableton Live 11` and `Max 4 Live` as
> requirements, and it requires you to load `external/LiveAPI.amxd` in Live
> before the HUD can connect.

> [!NOTE]
> Release builds are currently unsigned. On macOS you may need
> `Control-click -> Open`. On Windows you may see a SmartScreen warning before
> launch.

<!-- README_SCREENSHOT_TABLE_START -->
<table align="center">
  <tr>
    <th>State</th>
    <th>macOS</th>
    <th>Windows</th>
  </tr>
  <tr>
    <td>Playing</td>
    <td>
      <img
        src="docs/screenshots/hud-playing-macos.png?v=7be477c4109f"
        alt="Playing HUD on macOS"
        width="370"
      />
    </td>
    <td>
      <img
        src="docs/screenshots/hud-playing-windows.png?v=628fad16d529"
        alt="Playing HUD on Windows"
        width="370"
      />
    </td>
  </tr>
  <tr>
    <td>Stopped</td>
    <td>
      <img
        src="docs/screenshots/hud-stopped-macos.png?v=d84e8c369087"
        alt="Stopped HUD on macOS"
        width="370"
      />
    </td>
    <td>
      <img
        src="docs/screenshots/hud-stopped-windows.png?v=17179c752895"
        alt="Stopped HUD on Windows"
        width="370"
      />
    </td>
  </tr>
  <tr>
    <td>Disconnected</td>
    <td>
      <img
        src="docs/screenshots/hud-disconnected-macos.png?v=fd73b12df65d"
        alt="Disconnected HUD on macOS"
        width="370"
      />
    </td>
    <td>
      <img
        src="docs/screenshots/hud-disconnected-windows.png?v=fa1e1af95aa3"
        alt="Disconnected HUD on Windows"
        width="370"
      />
    </td>
  </tr>
  <tr>
    <td>Remaining</td>
    <td>
      <img
        src="docs/screenshots/hud-remaining-macos.png?v=83f2657a5fa5"
        alt="Remaining-mode HUD on macOS"
        width="370"
      />
    </td>
    <td>
      <img
        src="docs/screenshots/hud-remaining-windows.png?v=16925ca1ce84"
        alt="Remaining-mode HUD on Windows"
        width="370"
      />
    </td>
  </tr>
  <tr>
    <td>Compact</td>
    <td>
      <img
        src="docs/screenshots/hud-compact-macos.png?v=43c09a442bc3"
        alt="Compact counter-only HUD on macOS"
        width="320"
      />
    </td>
    <td>
      <img
        src="docs/screenshots/hud-compact-windows.png?v=efa51ff35267"
        alt="Compact counter-only HUD on Windows"
        width="320"
      />
    </td>
  </tr>
</table>
<!-- README_SCREENSHOT_TABLE_END -->

## Table of contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Install the Ableton bridge](#install-the-ableton-bridge)
- [Controls](#controls)
- [Troubleshooting](#troubleshooting)
- [Develop locally](#develop-locally)
- [Project docs](#project-docs)
- [License](#license)

## What it does

- shows the musical counter as `Bar:Beat:16th`
- switches between `Elapsed` and `Remaining` timing
- flashes the counter on beats, with a stronger downbeat flash
- shows clip, track, and scene labels with Live colors
- floats above other windows when needed
- remembers window size, position, timing mode, compact mode, and window state

## Quick start

### 1. Download and launch the app

Grab the latest release from GitHub Releases:

- macOS:
  `Ableton-HUD-vX.Y.Z-mac-universal.zip`
- Windows:
  `Ableton-HUD-vX.Y.Z-windows-x64-installer.exe`

Optional checksum verification:

```bash
shasum -a 256 -c Ableton-HUD-vX.Y.Z-mac-universal.zip.sha256
```

```powershell
Get-FileHash .\Ableton-HUD-vX.Y.Z-windows-x64-installer.exe -Algorithm SHA256
Get-Content .\Ableton-HUD-vX.Y.Z-windows-x64-installer.exe.sha256
```

Then launch the app:

- macOS: unzip the archive and open `Ableton HUD.app`
- Windows: run the installer, then launch `Ableton HUD`

### 2. Install the Ableton bridge

Ableton HUD does not talk to Live directly. It connects through the upstream
`ableton-live` bridge device: `LiveAPI.amxd`.

The upstream setup is simple:

1. Get `LiveAPI.amxd`.
   - If you are using the app as a release download, fetch
     [`external/LiveAPI.amxd`](https://github.com/ricardomatias/ableton-live/tree/master/external)
     from the upstream repository.
   - If you are working from this repo after `pnpm install`, the file already
     exists at `node_modules/ableton-live/external/LiveAPI.amxd`.
2. Open Ableton Live.
3. Drag `LiveAPI.amxd` onto any track.
   - The upstream README explicitly says any track is fine.
   - Putting it on the Master Track is a simple default.
4. Leave the device loaded while using the HUD.

By default the HUD expects the bridge at:

- host: `127.0.0.1`
- port: `9001`
- path: `/ableton-live`
- full endpoint: `ws://127.0.0.1:9001/ableton-live`

You can override host and port with:

- `ABLETON_HUD_LIVE_HOST`
- `ABLETON_HUD_LIVE_PORT`

### 3. Verify the connection

With Ableton Live open and `LiveAPI.amxd` loaded:

1. Start Ableton HUD.
2. Start playback in Live.
3. Confirm the counter advances and the clip/track/scene chips populate.

If the HUD launches but shows a disconnected state, jump to
[Troubleshooting](#troubleshooting).

## Controls

- `Elapsed` / `Remaining`: switch counter direction
- `FLOAT` / `NORMAL`: toggle always-on-top behavior
- `UNLOCKED` / `LOCKED`: follow the selected track or keep the current track
  pinned
- `COLLAPSE DETAILS` / `EXPAND DETAILS`: switch between the full HUD and the
  compact counter-only view

## Troubleshooting

| Symptom                           | What to check                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Counter stays `0:0:0`             | Make sure Ableton Live is playing and `LiveAPI.amxd` is loaded in the current Live set.                                                   |
| Status shows disconnected         | Confirm the bridge device is running at `127.0.0.1:9001` or update `ABLETON_HUD_LIVE_HOST` / `ABLETON_HUD_LIVE_PORT` to match your setup. |
| The app launches but stays tiny   | Preferences are persisted. Click `EXPAND DETAILS` once and the next launch should keep the larger layout.                                 |
| The bridge still will not connect | Reopen the Live set, reload `LiveAPI.amxd`, and confirm no other process is occupying the same bridge port.                               |

## Develop locally

### Requirements

- Node.js 22+
- pnpm 10+
- Ableton Live plus Max for Live if you want to test against a real Live
  session

### Install

```bash
pnpm install
```

### Run the app

```bash
pnpm run dev
```

Debug mode with auto-selected inspector ports:

```bash
pnpm run dev:debug
```

### Quality gates

Start with the autofix pass:

```bash
pnpm run lint:fix
```

Then use the stricter checks as needed:

```bash
pnpm run lint
pnpm test
pnpm run typecheck
pnpm run build
pnpm run test:e2e
pre-commit run --all-files
```

Useful notes:

- `pnpm run lint` is the zero-warning lint gate.
- `pnpm test` randomizes file order and in-file test order.
- Reproduce a shuffled Vitest run with
  `VITEST_SEQUENCE_SEED=<seed> pnpm test`.
- `pnpm run test:e2e` builds first, then runs the Playwright Electron suite.

### Build release targets locally

```bash
pnpm run dist:mac
pnpm run dist:win
```

## Project docs

- [ARCHITECTURE.md](ARCHITECTURE.md): runtime map and source-of-truth file
  layout
- [docs/QUALITY.md](docs/QUALITY.md): local gates, CI jobs, and reporting
  expectations
- [docs/product-specs/README.md](docs/product-specs/README.md): user-facing
  behavior contracts

CI summary:

- pull requests and `main` run lint, unit tests, E2E, and build validation on
  macOS and Windows
- successful `main` pushes publish a merged Playwright report to GitHub Pages
- `v*` tags publish the macOS zip and Windows installer as immutable release
  assets

## License

[MIT](LICENSE)
