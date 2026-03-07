# Harness Docs Adoption

## Problem

Adopt the repo-side harness-documentation pieces that make Ableton HUD easier to navigate and validate.

## Acceptance Criteria

- Root agent guidance becomes a short navigation map instead of a monolithic rule dump.
- The repo ships `ARCHITECTURE.md`, `docs/QUALITY.md`, product specs, and execution-plan docs.
- Harness docs are mechanically validated and wired into local developer automation.

## Touched Areas

- root docs and harness contract
- validation scripts and package scripts
- pre-commit automation

## Validation

- `pre-commit run --all-files`

## Outcome

Completed. The repo now has navigable harness docs, product specs, execution-plan scaffolding, and a docs validator that runs through pre-commit and therefore in CI's lint workflow.
