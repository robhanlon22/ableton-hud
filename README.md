# AOSC HUD

A small, always-on-top desktop HUD for Ableton Live that talks directly to [AbletonOSC](https://github.com/ideoforms/AbletonOSC).

It follows the selected track's currently playing Session clip and displays:

- `Bar:Beat:16th` musical readout (elapsed by default, with a remaining toggle)
- Beat pulse flash on every beat with a stronger downbeat pulse
- Last-bar color warning in both modes
- Loop-cycle labels (`L1`, `L2`, ...) once playback is in the loop section

UI stack:

- React renderer
- Tailwind CSS with an Ableton-inspired token palette
- shadcn-style component primitives

Behavior details:

- Non-loop clips:
  - elapsed mode counts from launch to clip end
  - remaining mode counts down to clip end
- Looping clips:
  - elapsed mode resets each loop cycle
  - remaining mode counts down to next `loop_end`
  - last-bar warning is based on `loop_end`
  - if the clip starts before `loop_start`, cycle labels stay hidden during intro

## Requirements

- macOS
- Ableton Live with AbletonOSC installed and running
- Node.js 22+ (tested with newer)

## OSC Assumptions (v1)

Ports are hardcoded:

- AbletonOSC receive: `127.0.0.1:11000`
- HUD listen: `127.0.0.1:11001`

## Development

```bash
npm install
npm run dev
```

Debug build with inspect ports:

```bash
npm run dev:debug
```

This auto-picks free ports starting from:

- Main process inspector: `9230` (override with `AOSC_MAIN_DEBUG_PORT`)
- Renderer Chrome DevTools Protocol: `9222` (override with `AOSC_RENDERER_DEBUG_PORT`)

## Validation

```bash
npm test
npm run typecheck
npm run build
```

`npm test` runs both:

- node timing/counter unit tests
- jsdom renderer component tests

## Build macOS `.app`

```bash
npm run dist:mac
```

Output:

- `dist/mac-arm64/AOSC HUD.app`

This build is unsigned. On first launch, use Control-click -> Open in Finder.
