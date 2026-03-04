import OSC, { type OscMessage, type UDPPort } from 'osc';
import {
  computeBeatInBar,
  computeBeatsPerBar,
  computeIsLastBar,
  computeRemainingBeats,
  createElapsedAccumulator,
  updateElapsedAccumulator
} from './counter';
import type { ClipTimingMeta, ElapsedAccumulator, HudMode, HudState } from '../shared/types';

const OSC_HOST = '127.0.0.1';
const OSC_SEND_PORT = 11000;
const OSC_LISTEN_PORT = 11001;

function argValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as { value: unknown }).value;
  }
  return value;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(argValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown): boolean {
  const resolved = argValue(value);
  if (typeof resolved === 'boolean') {
    return resolved;
  }
  if (typeof resolved === 'number') {
    return resolved !== 0;
  }
  if (typeof resolved === 'string') {
    const lowered = resolved.toLowerCase();
    return lowered === 'true' || lowered === '1';
  }
  return false;
}

function toStringValue(value: unknown): string {
  const resolved = argValue(value);
  return typeof resolved === 'string' ? resolved : String(resolved ?? '');
}

export class AbletonOscBridge {
  private readonly port: UDPPort;
  private readonly connectionHeartbeatMs = 5000;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private onState: (state: HudState) => void;

  private mode: HudMode;
  private selectedTrack: number | null = null;
  private activeClip: { track: number; clip: number } | null = null;
  private clipName: string | null = null;
  private clipMeta: ClipTimingMeta = {
    length: 4,
    loopStart: 0,
    loopEnd: 4,
    looping: false
  };

  private signatureNumerator = 4;
  private signatureDenominator = 4;
  private isPlaying = false;
  private beatCounter = 1;
  private beatFlashToken = 0;
  private elapsedAccumulator: ElapsedAccumulator = createElapsedAccumulator();

  private connected = false;
  private lastMessageAt = 0;

  constructor(mode: HudMode, onState: (state: HudState) => void) {
    this.mode = mode;
    this.onState = onState;
    this.port = new OSC.UDPPort({
      localAddress: OSC_HOST,
      localPort: OSC_LISTEN_PORT,
      remoteAddress: OSC_HOST,
      remotePort: OSC_SEND_PORT,
      metadata: false
    });
  }

  start(): void {
    this.port.on('ready', () => {
      this.bootstrap();
      this.emit();
    });

    this.port.on('error', () => {
      this.connected = false;
      this.emit();
    });

    this.port.on('message', (message: OscMessage) => {
      this.connected = true;
      this.lastMessageAt = Date.now();
      this.handleMessage(message.address, message.args ?? []);
    });

    this.port.open();

    this.heartbeatInterval = setInterval(() => {
      const wasConnected = this.connected;
      this.connected = Date.now() - this.lastMessageAt <= this.connectionHeartbeatMs;
      if (wasConnected !== this.connected) {
        this.emit();
      }
    }, 1000);
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.clearClipSubscription();
    if (this.selectedTrack !== null) {
      this.send('/live/track/stop_listen/playing_slot_index', [this.selectedTrack]);
    }
    this.send('/live/view/stop_listen/selected_track');
    this.send('/live/song/stop_listen/signature_numerator');
    this.send('/live/song/stop_listen/signature_denominator');
    this.send('/live/song/stop_listen/is_playing');
    this.send('/live/song/stop_listen/beat');

    this.port.close();
  }

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.emit();
  }

  setOnState(nextOnState: (state: HudState) => void): void {
    this.onState = nextOnState;
    this.emit();
  }

  private bootstrap(): void {
    this.send('/live/song/start_listen/beat');
    this.send('/live/song/start_listen/signature_numerator');
    this.send('/live/song/start_listen/signature_denominator');
    this.send('/live/song/start_listen/is_playing');
    this.send('/live/view/start_listen/selected_track');

    this.send('/live/song/get/signature_numerator');
    this.send('/live/song/get/signature_denominator');
    this.send('/live/song/get/is_playing');
    this.send('/live/view/get/selected_track');
  }

  private send(address: string, args: unknown[] = []): void {
    this.port.send({ address, args });
  }

  private handleMessage(address: string, args: unknown[]): void {
    switch (address) {
      case '/live/view/get/selected_track': {
        this.handleSelectedTrack(toNumber(args[0], -1));
        return;
      }

      case '/live/track/get/playing_slot_index': {
        const track = toNumber(args[0], -1);
        const slot = toNumber(args[1], -1);
        if (this.selectedTrack !== null && track === this.selectedTrack) {
          this.handlePlayingSlot(slot);
        }
        return;
      }

      case '/live/clip/get/name': {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipName = toStringValue(args[2]);
          this.emit();
        }
        return;
      }

      case '/live/clip/get/length': {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.length = toNumber(args[2], this.clipMeta.length);
          this.emit();
        }
        return;
      }

      case '/live/clip/get/loop_start': {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.loopStart = toNumber(args[2], this.clipMeta.loopStart);
          this.emit();
        }
        return;
      }

      case '/live/clip/get/loop_end': {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.loopEnd = toNumber(args[2], this.clipMeta.loopEnd);
          this.emit();
        }
        return;
      }

      case '/live/clip/get/looping': {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.looping = toBoolean(args[2]);
          this.emit();
        }
        return;
      }

      case '/live/clip/get/playing_position': {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          const position = toNumber(args[2], 0);
          this.elapsedAccumulator = updateElapsedAccumulator(this.elapsedAccumulator, position, this.clipMeta);
          this.emit();
        }
        return;
      }

      case '/live/song/get/signature_numerator': {
        this.signatureNumerator = Math.max(1, Math.round(toNumber(args[0], this.signatureNumerator)));
        this.emit();
        return;
      }

      case '/live/song/get/signature_denominator': {
        this.signatureDenominator = Math.max(1, Math.round(toNumber(args[0], this.signatureDenominator)));
        this.emit();
        return;
      }

      case '/live/song/get/is_playing': {
        this.isPlaying = toBoolean(args[0]);
        this.emit();
        return;
      }

      case '/live/song/get/beat': {
        this.beatCounter = Math.max(1, Math.round(toNumber(args[0], this.beatCounter)));
        this.beatFlashToken += 1;
        this.emit();
        return;
      }

      default:
        return;
    }
  }

  private handleSelectedTrack(trackIndex: number): void {
    if (trackIndex < 0) {
      return;
    }

    if (this.selectedTrack === trackIndex) {
      return;
    }

    if (this.selectedTrack !== null) {
      this.send('/live/track/stop_listen/playing_slot_index', [this.selectedTrack]);
    }

    this.selectedTrack = trackIndex;
    this.clearClipSubscription();

    this.send('/live/track/start_listen/playing_slot_index', [trackIndex]);
    this.send('/live/track/get/playing_slot_index', [trackIndex]);
    this.emit();
  }

  private handlePlayingSlot(slotIndex: number): void {
    if (this.selectedTrack === null) {
      return;
    }

    if (slotIndex < 0) {
      this.clearClipSubscription();
      this.emit();
      return;
    }

    if (this.activeClip && this.activeClip.track === this.selectedTrack && this.activeClip.clip === slotIndex) {
      return;
    }

    this.clearClipSubscription();

    this.activeClip = { track: this.selectedTrack, clip: slotIndex };
    this.clipName = null;
    this.clipMeta = {
      length: 4,
      loopStart: 0,
      loopEnd: 4,
      looping: false
    };
    this.elapsedAccumulator = createElapsedAccumulator();

    this.send('/live/clip/start_listen/playing_position', [this.selectedTrack, slotIndex]);
    this.send('/live/clip/get/playing_position', [this.selectedTrack, slotIndex]);
    this.send('/live/clip/get/name', [this.selectedTrack, slotIndex]);
    this.send('/live/clip/get/length', [this.selectedTrack, slotIndex]);
    this.send('/live/clip/get/loop_start', [this.selectedTrack, slotIndex]);
    this.send('/live/clip/get/loop_end', [this.selectedTrack, slotIndex]);
    this.send('/live/clip/get/looping', [this.selectedTrack, slotIndex]);

    this.emit();
  }

  private clearClipSubscription(): void {
    if (this.activeClip) {
      this.send('/live/clip/stop_listen/playing_position', [this.activeClip.track, this.activeClip.clip]);
    }

    this.activeClip = null;
    this.clipName = null;
    this.elapsedAccumulator = createElapsedAccumulator();
  }

  private isActiveClip(track: number, clip: number): boolean {
    return Boolean(this.activeClip && this.activeClip.track === track && this.activeClip.clip === clip);
  }

  private emit(): void {
    const beatsPerBar = computeBeatsPerBar(this.signatureNumerator, this.signatureDenominator);
    const beatInBar = computeBeatInBar(this.beatCounter, beatsPerBar);

    let barsValue = 0;
    let isLastBar = false;

    if (this.activeClip) {
      if (this.mode === 'elapsed') {
        barsValue = this.elapsedAccumulator.elapsedBeats / beatsPerBar;
      } else {
        const position = this.elapsedAccumulator.prevPosition ?? 0;
        const remainingBeats = computeRemainingBeats(position, this.clipMeta);
        barsValue = remainingBeats / beatsPerBar;
        isLastBar = computeIsLastBar(barsValue);
      }
    }

    const next: HudState = {
      connected: this.connected,
      isPlaying: this.isPlaying,
      trackIndex: this.activeClip?.track ?? this.selectedTrack,
      clipIndex: this.activeClip?.clip ?? null,
      clipName: this.clipName,
      mode: this.mode,
      barsValue,
      beatInBar,
      isLastBar,
      beatFlashToken: this.beatFlashToken
    };

    this.onState(next);
  }
}
