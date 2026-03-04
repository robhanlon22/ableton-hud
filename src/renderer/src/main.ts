import './style.css';
import type { HudMode, HudState } from '../../shared/types';

const root = document.getElementById('app') as HTMLElement;
const clipName = document.getElementById('clip-name') as HTMLElement;
const statusPill = document.getElementById('status-pill') as HTMLElement;
const counterLabel = document.getElementById('counter-label') as HTMLElement;
const counterValue = document.getElementById('counter-value') as HTMLElement;
const beatValue = document.getElementById('beat-value') as HTMLElement;
const cycleLabel = document.getElementById('cycle-label') as HTMLElement;
const modeToggle = document.getElementById('mode-toggle') as HTMLButtonElement;
const topmostToggle = document.getElementById('topmost-toggle') as HTMLButtonElement;

let currentState: HudState | null = null;
let lastBeatFlashToken = -1;
let flashTimeout: number | null = null;

function formatClip(state: HudState): string {
  if (state.trackIndex === null || state.clipIndex === null) {
    return 'No active clip';
  }

  const trackNumber = state.trackIndex + 1;
  const clipNumber = state.clipIndex + 1;
  const label = state.clipName && state.clipName.trim().length > 0 ? ` - ${state.clipName}` : '';
  return `T${trackNumber} C${clipNumber}${label}`;
}

function statusText(state: HudState): string {
  if (!state.connected) {
    return 'DISCONNECTED';
  }
  if (!state.isPlaying) {
    return 'STOPPED';
  }
  if (state.clipIndex === null) {
    return 'WAITING';
  }
  return 'PLAYING';
}

function modeLabel(mode: HudMode): string {
  return mode === 'elapsed' ? 'Elapsed (Bar:Beat:16th)' : 'Remaining (Bar:Beat:16th)';
}

function modeButtonText(mode: HudMode): string {
  return `Mode: ${mode === 'elapsed' ? 'Elapsed' : 'Remaining'}`;
}

function flashDuration(state: HudState): number {
  const base = state.isDownbeat ? 220 : 140;
  return state.isLastBar ? base + 80 : base;
}

function updateFlash(state: HudState): void {
  if (state.beatFlashToken === lastBeatFlashToken) {
    return;
  }

  lastBeatFlashToken = state.beatFlashToken;
  root.classList.add('beat-flash');
  root.classList.toggle('downbeat-flash', state.isDownbeat);

  if (flashTimeout !== null) {
    window.clearTimeout(flashTimeout);
  }

  flashTimeout = window.setTimeout(() => {
    root.classList.remove('beat-flash');
    root.classList.remove('downbeat-flash');
    flashTimeout = null;
  }, flashDuration(state));
}

function renderCycleLabel(state: HudState): void {
  if (!state.cycleLabel || state.isIntroPhase) {
    cycleLabel.textContent = '';
    cycleLabel.style.visibility = 'hidden';
    return;
  }

  cycleLabel.textContent = state.cycleLabel;
  cycleLabel.style.visibility = 'visible';
}

function render(state: HudState): void {
  currentState = state;

  clipName.textContent = formatClip(state);
  statusPill.textContent = statusText(state);
  counterLabel.textContent = modeLabel(state.mode);
  counterValue.textContent = state.counterText;
  beatValue.textContent = `Beat ${state.beatInBar}`;
  modeToggle.textContent = modeButtonText(state.mode);

  renderCycleLabel(state);

  root.classList.toggle('last-bar', state.isLastBar);
  root.classList.toggle('looping', state.isLoopingClip);
  updateFlash(state);
}

window.hudApi.onHudState(render);

modeToggle.addEventListener('click', () => {
  if (!currentState) {
    return;
  }

  const nextMode: HudMode = currentState.mode === 'elapsed' ? 'remaining' : 'elapsed';
  void window.hudApi.setMode(nextMode);
});

topmostToggle.addEventListener('click', () => {
  void window.hudApi.toggleTopmost();
});
