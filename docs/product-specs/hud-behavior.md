# HUD Behavior

## Product Scope

Ableton HUD is a desktop companion for Ableton Live. It presents clip timing in
a compact Electron window that can remain visible while Live is in use.

Primary user outcomes:

- See clip timing as `Bar:Beat:16th`
- Switch between elapsed and remaining views
- Recognize transport state at a glance
- Keep the window floating or compact when needed

## Launch And Runtime States

### Connected and playing

- The counter advances continuously.
- Clip, track, and scene metadata populate when available.
- The transport badge indicates playback.

### Connected but stopped

- The HUD stays visible and readable.
- The transport badge indicates a stopped state.
- Counter text remains stable until playback resumes.

### Disconnected or missing transport data

- The window still renders a complete interface.
- Full view makes the disconnected state explicit with a visible status badge.
- Missing metadata renders minimal dash placeholders instead of blank pills.
- Disconnect clears transport and metadata back to a neutral, readable
  presentation instead of leaving stale or dead-looking state behind.

## Controls

### Mode toggle

- Full view exposes an `Elapsed` / `Remaining` toggle.
- Switching modes updates both the visible label and the counter direction.

### Floating toggle

- Full view exposes `FLOAT` / `NORMAL` window behavior.
- Fresh preferences default to floating mode on.
- The toggle reflects the current always-on-top state after the action
  completes.

### Track lock toggle

- Full view exposes `UNLOCKED` / `LOCKED` behavior.
- The lock state remains visible after toggling so the user can tell whether the
  track selection is pinned.

### Compact toggle

- Full view can collapse to a counter-only compact view.
- Compact view hides the metadata header and footer controls.
- Compact mode should resize the window to fit the counter panel.
- Expanding restores the full layout.

## Visual Expectations

- The large mono counter is the visual focal point.
- Metadata pills use Live colors when available and neutral styling when not.
- Urgent transport states use stronger warning and flash styling without making
  the counter unreadable.
- Disconnected or degraded states use muted counter styling and should still
  look intentional, not like a broken loading screen.

## Persistence

- Window size and position persist between launches.
- Mode, compact mode, topmost state, and track lock preference persist between
  launches.

## Non-Goals

- The app does not edit Ableton state.
- Automated tests do not depend on a live local Ableton instance.
