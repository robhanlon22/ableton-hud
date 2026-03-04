# AOSC HUD

A small, always-on-top desktop HUD for Ableton Live that talks directly to [AbletonOSC](https://github.com/ideoforms/AbletonOSC).

It follows the selected track's currently playing Session clip and displays:

- Bars elapsed (default), with a toggle to bars remaining
- Beat pulse flash
- Last-bar color change in countdown mode

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

## Validation

```bash
npm test
npm run typecheck
npm run build
```

## Build macOS `.app`

```bash
npm run dist:mac
```

Output:

- `dist/mac-arm64/AOSC HUD.app`

This build is unsigned. On first launch, use Control-click -> Open in Finder.
