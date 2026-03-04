import './style.css';
import type { HudMode, HudState } from '../../shared/types';

const root = document.getElementById('app') as HTMLElement;
const clipName = document.getElementById('clip-name') as HTMLElement;
const statusPill = document.getElementById('status-pill') as HTMLElement;
const counterLabel = document.getElementById('counter-label') as HTMLElement;
const counterValue = document.getElementById('counter-value') as HTMLElement;
const beatValue = document.getElementById('beat-value') as HTMLElement;
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
  return mode === 'elapsed' ? 'Bars Elapsed' : 'Bars Remaining';
}

function modeButtonText(mode: HudMode): string {
  return `Mode: ${mode === 'elapsed' ? 'Elapsed' : 'Remaining'}`;
}

function updateFlash(state: HudState): void {
  if (state.beatFlashToken === lastBeatFlashToken) {
    return;
  }

  lastBeatFlashToken = state.beatFlashToken;
  root.classList.add('beat-flash');
  if (flashTimeout !== null) {
    window.clearTimeout(flashTimeout);
  }

  flashTimeout = window.setTimeout(() => {
    root.classList.remove('beat-flash');
    flashTimeout = null;
  }, state.isLastBar ? 220 : 140);
}

function render(state: HudState): void {
  currentState = state;

  clipName.textContent = formatClip(state);
  statusPill.textContent = statusText(state);
  counterLabel.textContent = modeLabel(state.mode);
  counterValue.textContent = state.barsValue.toFixed(2);
  beatValue.textContent = `Beat ${state.beatInBar}`;
  modeToggle.textContent = modeButtonText(state.mode);

  root.classList.toggle('last-bar', state.isLastBar && state.mode === 'remaining');
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
