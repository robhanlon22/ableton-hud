import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultHudState } from '../../../shared/ipc';
import type { HudState } from '../../../shared/types';
import { HudSurface, resolveHeldClipColor, shouldHoldNullClipTransition } from './hud-app';

function makeState(overrides: Partial<HudState> = {}): HudState {
  return {
    ...createDefaultHudState(),
    connected: true,
    isPlaying: true,
    trackIndex: 0,
    trackName: 'Kick',
    clipIndex: 1,
    clipName: 'Build',
    sceneName: 'Drop',
    counterText: '2:3:4',
    ...overrides
  };
}

describe('HudSurface', () => {
  it('renders clip and counter text', () => {
    render(
      <HudSurface
        state={makeState()}
        isFlashActive={false}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
      />
    );

    expect(screen.getByTestId('clip-pill')).toHaveTextContent('Build');
    expect(screen.getByTestId('track-pill')).toHaveTextContent('Kick');
    expect(screen.getByTestId('scene-pill')).toHaveTextContent('Drop');
    expect(screen.getByTestId('counter-text')).toHaveTextContent('2:3:4');
  });

  it('triggers mode toggle callback', () => {
    const onToggleMode = vi.fn();

    render(
      <HudSurface
        state={makeState({ mode: 'elapsed' })}
        isFlashActive={false}
        onToggleMode={onToggleMode}
        onToggleTopmost={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('mode-toggle'));
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });

  it('applies warning styling when in last bar', () => {
    render(
      <HudSurface
        state={makeState({ isLastBar: true })}
        isFlashActive={true}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
      />
    );

    expect(screen.getByTestId('counter-text')).toHaveClass('text-ableton-warning');
  });

  it('uses metadata colors as pill backgrounds with contrasting text', () => {
    render(
      <HudSurface
        state={makeState({ clipColor: 0xffd000, trackColor: 0x3344ff, sceneColor: 0x008c66 })}
        isFlashActive={false}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
      />
    );

    const clipPill = screen.getByTestId('clip-pill');
    const trackPill = screen.getByTestId('track-pill');
    const scenePill = screen.getByTestId('scene-pill');

    expect(clipPill).toHaveStyle('background-color: rgb(255, 208, 0)');
    expect(clipPill).toHaveStyle('color: rgb(16, 18, 22)');
    expect(trackPill).toHaveStyle('background-color: rgb(51, 68, 255)');
    expect(scenePill).toHaveStyle('background-color: rgb(0, 140, 102)');
  });

  it('renders empty metadata pills when names are missing', () => {
    render(
      <HudSurface
        state={makeState({ clipName: null, trackName: null, sceneName: null })}
        isFlashActive={false}
        onToggleMode={vi.fn()}
        onToggleTopmost={vi.fn()}
      />
    );

    expect(screen.getByTestId('clip-pill').textContent).toBe('');
    expect(screen.getByTestId('track-pill').textContent).toBe('');
    expect(screen.getByTestId('scene-pill').textContent).toBe('');
  });
});

describe('shouldHoldNullClipTransition', () => {
  it('holds when next state temporarily drops clip during track handoff', () => {
    const previous = makeState({ trackIndex: 0, clipIndex: 2, isPlaying: true });
    const next = makeState({ trackIndex: 1, clipIndex: null, isPlaying: true });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(true);
  });

  it('does not hold when transport is stopped', () => {
    const previous = makeState({ clipIndex: 2, isPlaying: true });
    const next = makeState({ clipIndex: null, isPlaying: false });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(false);
  });

  it('does not hold when there was no previous clip', () => {
    const previous = makeState({ clipIndex: null, isPlaying: true });
    const next = makeState({ clipIndex: null, isPlaying: true });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(false);
  });

  it('does not hold when clip drops on same track', () => {
    const previous = makeState({ trackIndex: 2, clipIndex: 3, isPlaying: true });
    const next = makeState({ trackIndex: 2, clipIndex: null, isPlaying: true });
    expect(shouldHoldNullClipTransition(previous, next)).toBe(false);
  });
});

describe('resolveHeldClipColor', () => {
  it('keeps previous color during playing null-clip handoff', () => {
    const next = makeState({ isPlaying: true, clipIndex: null, clipColor: null });
    expect(resolveHeldClipColor(0xff00aa, next)).toBe(0xff00aa);
  });

  it('uses incoming clip color when provided', () => {
    const next = makeState({ isPlaying: true, clipColor: 0x00ccff });
    expect(resolveHeldClipColor(0xff00aa, next)).toBe(0x00ccff);
  });

  it('clears held color when transport is stopped', () => {
    const next = makeState({ isPlaying: false, clipIndex: null, clipColor: null });
    expect(resolveHeldClipColor(0xff00aa, next)).toBeNull();
  });
});
