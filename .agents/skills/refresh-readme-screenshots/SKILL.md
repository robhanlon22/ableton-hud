---
name: refresh-readme-screenshots
description: Refresh the README HUD screenshots from the published GitHub Pages Playwright report. Use when `README.md` or `docs/screenshots/` need the latest macOS and Windows smoke-state images from CI.
---

# Refresh README Screenshots

## When to use

Use this skill when:

- the README screenshot table needs the latest macOS and Windows smoke renders
- `docs/screenshots/` should be refreshed from the published GitHub Pages report
- the report on `https://robhanlon22.github.io/ableton-hud/` is the source of truth

Do not use this skill for ad hoc image editing or for screenshots that do not
come from the Playwright smoke report.

## Workflow

1. Run `scripts/refresh_readme_screenshots.py` from the repo root.
2. Review the updated files under `docs/screenshots/` and the screenshot table
   near the top of `README.md`.
3. Run `pre-commit run --all-files`.

## What the script does

- fetches the published GitHub Pages Playwright report
- extracts the embedded `report.json` from the self-contained HTML bundle
- finds the `hud/electron-hud-smoke.spec.ts` tests under
  `HUD screenshot smoke states`
- downloads the five expected states for both `macos` and `windows`:
  `playing`, `stopped`, `disconnected`, `remaining`, and `compact`
- writes them to `docs/screenshots/hud-<state>-<platform>.png`
- rewrites the README screenshot block between
  `README_SCREENSHOT_TABLE_START` and `README_SCREENSHOT_TABLE_END`
- removes the legacy one-column screenshot files if they still exist

The script fails fast if any expected attachment is missing. It should not
silently produce a partial screenshot set.

## Script

- `scripts/refresh_readme_screenshots.py`

Important options:

- `--report-url`: override the GitHub Pages report root if needed
- `--repo-root`: point the script at another checkout if it is not being run
  from this repo layout

## Validation

Run:

```bash
python3 .agents/skills/refresh-readme-screenshots/scripts/refresh_readme_screenshots.py
python3 /Users/rob/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .agents/skills/refresh-readme-screenshots
pre-commit run --all-files
```
