import OSC, { type OscMessage, type UDPPort } from "osc";

import type {
  ClipTimingMeta,
  CounterParts,
  HudMode,
  HudState,
  LastBarSource,
} from "../shared/types";

import {
  computeBeatInBar,
  computeIsLastBar,
  createTimingGrid,
  EPSILON,
  formatCounterParts,
  hasValidLoopSpan,
  toElapsedCounterParts,
  toRemainingCounterParts,
} from "./counter";

const OSC_HOST = "127.0.0.1";
const OSC_SEND_PORT = 11000;
const OSC_LISTEN_PORT = 11001;

export class AbletonOscBridge {
  private activeClip: null | { clip: number; track: number } = null;
  private activeScene: null | number = null;
  private beatCounter = 0;

  private beatFlashToken = 0;

  private clipColor: null | number = null;
  private clipMeta: ClipTimingMeta = {
    length: 4,
    loopEnd: 4,
    looping: false,
    loopStart: 0,
  };
  private clipName: null | string = null;
  private connected = false;
  private readonly connectionHeartbeatMs = 5000;
  private currentPosition: null | number = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isPlaying = false;
  private lastMessageAt = 0;
  private launchPosition: null | number = null;
  private loopWrapCount = 0;

  private mode: HudMode;
  private onState: (state: HudState) => void;
  private pendingSelectedTrack: null | number = null;
  private readonly port: UDPPort;
  private previousPosition: null | number = null;
  private sceneColor: null | number = null;

  private sceneName: null | string = null;
  private selectedTrack: null | number = null;
  private signatureDenominator = 4;
  private signatureNumerator = 4;

  private trackColor: null | number = null;
  private trackLocked: boolean;
  private trackName: null | string = null;

  constructor(
    mode: HudMode,
    onState: (state: HudState) => void,
    trackLocked = false,
  ) {
    this.mode = mode;
    this.onState = onState;
    this.trackLocked = trackLocked;
    this.port = new OSC.UDPPort({
      localAddress: OSC_HOST,
      localPort: OSC_LISTEN_PORT,
      metadata: false,
      remoteAddress: OSC_HOST,
      remotePort: OSC_SEND_PORT,
    });
  }

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.emit();
  }

  setTrackLocked(trackLocked: boolean): void {
    if (this.trackLocked === trackLocked) {
      return;
    }

    this.trackLocked = trackLocked;
    if (!trackLocked && this.pendingSelectedTrack !== null) {
      const pendingTrack = this.pendingSelectedTrack;
      this.pendingSelectedTrack = null;
      this.applySelectedTrack(pendingTrack);
      return;
    }

    this.emit();
  }

  start(): void {
    this.port.on("ready", () => {
      this.bootstrap();
      this.emit();
    });

    this.port.on("error", () => {
      this.connected = false;
      this.emit();
    });

    this.port.on("message", (message: OscMessage) => {
      this.connected = true;
      this.lastMessageAt = Date.now();
      this.handleMessage(message.address, message.args ?? []);
    });

    this.port.open();

    this.heartbeatInterval = setInterval(() => {
      const wasConnected = this.connected;
      this.connected =
        Date.now() - this.lastMessageAt <= this.connectionHeartbeatMs;
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
      this.send("/live/track/stop_listen/playing_slot_index", [
        this.selectedTrack,
      ]);
      this.send("/live/track/stop_listen/name", [this.selectedTrack]);
      this.send("/live/track/stop_listen/color", [this.selectedTrack]);
    }
    this.send("/live/view/stop_listen/selected_track");
    this.send("/live/song/stop_listen/signature_numerator");
    this.send("/live/song/stop_listen/signature_denominator");
    this.send("/live/song/stop_listen/is_playing");
    this.send("/live/song/stop_listen/beat");

    this.port.close();
  }

  toggleTrackLock(): boolean {
    this.setTrackLocked(!this.trackLocked);
    return this.trackLocked;
  }

  private applySelectedTrack(trackIndex: number): void {
    if (this.selectedTrack === trackIndex) {
      return;
    }

    if (this.selectedTrack !== null) {
      this.send("/live/track/stop_listen/playing_slot_index", [
        this.selectedTrack,
      ]);
      this.send("/live/track/stop_listen/name", [this.selectedTrack]);
      this.send("/live/track/stop_listen/color", [this.selectedTrack]);
    }

    this.selectedTrack = trackIndex;
    this.trackName = null;
    this.trackColor = null;
    this.clearClipSubscription();

    this.send("/live/track/start_listen/playing_slot_index", [trackIndex]);
    this.send("/live/track/get/playing_slot_index", [trackIndex]);
    this.send("/live/track/start_listen/name", [trackIndex]);
    this.send("/live/track/get/name", [trackIndex]);
    this.send("/live/track/start_listen/color", [trackIndex]);
    this.send("/live/track/get/color", [trackIndex]);
    this.emit();
  }

  private bootstrap(): void {
    this.send("/live/song/start_listen/beat");
    this.send("/live/song/start_listen/signature_numerator");
    this.send("/live/song/start_listen/signature_denominator");
    this.send("/live/song/start_listen/is_playing");
    this.send("/live/view/start_listen/selected_track");

    this.send("/live/song/get/signature_numerator");
    this.send("/live/song/get/signature_denominator");
    this.send("/live/song/get/is_playing");
    this.send("/live/view/get/selected_track");
  }

  private clearClipSubscription(): void {
    if (this.activeClip) {
      this.send("/live/clip/stop_listen/playing_position", [
        this.activeClip.track,
        this.activeClip.clip,
      ]);
    }

    this.clearSceneSubscription();
    this.activeClip = null;
    this.clipName = null;
    this.clipColor = null;
    this.resetClipRunState();
  }

  private clearSceneSubscription(): void {
    if (this.activeScene !== null) {
      this.send("/live/scene/stop_listen/name", [this.activeScene]);
      this.send("/live/scene/stop_listen/color", [this.activeScene]);
    }

    this.activeScene = null;
    this.sceneName = null;
    this.sceneColor = null;
  }

  private emit(): void {
    const timingGrid = createTimingGrid(
      this.signatureNumerator,
      this.signatureDenominator,
    );
    const beatInBar = computeBeatInBar(
      this.beatCounter,
      timingGrid.beatsPerBar,
    );
    const isDownbeat = beatInBar === 1;

    let counterParts = defaultCounterParts();
    let isLastBar = false;
    let lastBarSource: LastBarSource = null;

    if (this.activeClip && this.currentPosition !== null) {
      const currentPosition = this.currentPosition;
      const launchPosition = this.launchPosition ?? currentPosition;
      const loopSpanValid = hasValidLoopSpan(this.clipMeta);

      if (loopSpanValid) {
        const hasLoopIntro = launchPosition < this.clipMeta.loopStart - EPSILON;
        const inLoopSection =
          this.loopWrapCount > 0 ||
          currentPosition >= this.clipMeta.loopStart - EPSILON;
        const isIntroPhase = hasLoopIntro && !inLoopSection;

        const remainingToLoopEnd = Math.max(
          this.clipMeta.loopEnd - currentPosition,
          0,
        );
        isLastBar = computeIsLastBar(
          remainingToLoopEnd,
          timingGrid.beatsPerBar,
        );
        lastBarSource = "loop_end";

        if (this.mode === "elapsed") {
          const elapsedBeats = isIntroPhase
            ? Math.max(currentPosition - launchPosition, 0)
            : Math.max(currentPosition - this.clipMeta.loopStart, 0);
          counterParts = toElapsedCounterParts(elapsedBeats, timingGrid);
        } else {
          counterParts = toRemainingCounterParts(
            remainingToLoopEnd,
            timingGrid,
          );
        }
      } else {
        const remainingToClipEnd = Math.max(
          this.clipMeta.length - currentPosition,
          0,
        );
        isLastBar = computeIsLastBar(
          remainingToClipEnd,
          timingGrid.beatsPerBar,
        );
        lastBarSource = "clip_end";

        if (this.mode === "elapsed") {
          const elapsedBeats = Math.max(currentPosition - launchPosition, 0);
          counterParts = toElapsedCounterParts(elapsedBeats, timingGrid);
        } else {
          counterParts = toRemainingCounterParts(
            remainingToClipEnd,
            timingGrid,
          );
        }
      }
    }

    const next: HudState = {
      alwaysOnTop: false,
      beatFlashToken: this.beatFlashToken,
      beatInBar,
      clipColor: this.clipColor,
      clipIndex: this.activeClip?.clip ?? null,
      clipName: this.clipName,
      connected: this.connected,
      counterParts,
      counterText: formatCounterParts(counterParts),
      isDownbeat,
      isLastBar,
      isPlaying: this.isPlaying,
      lastBarSource,
      mode: this.mode,
      sceneColor: this.sceneColor,
      sceneName: this.sceneName,
      trackColor: this.trackColor,
      trackIndex: this.activeClip?.track ?? this.selectedTrack,
      trackLocked: this.trackLocked,
      trackName: this.trackName,
    };

    this.onState(next);
  }

  private handleMessage(address: string, args: unknown[]): void {
    switch (address) {
      case "/live/clip/get/color": {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipColor = toColorValue(args[2]);
          this.emit();
        }
        return;
      }

      case "/live/clip/get/length": {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.length = toNumber(args[2], this.clipMeta.length);
          this.emit();
        }
        return;
      }

      case "/live/clip/get/loop_end": {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.loopEnd = toNumber(args[2], this.clipMeta.loopEnd);
          this.emit();
        }
        return;
      }

      case "/live/clip/get/loop_start": {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.loopStart = toNumber(args[2], this.clipMeta.loopStart);
          this.emit();
        }
        return;
      }

      case "/live/clip/get/looping": {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipMeta.looping = toBoolean(args[2]);
          this.emit();
        }
        return;
      }

      case "/live/clip/get/name": {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.clipName = toStringValue(args[2]);
          this.emit();
        }
        return;
      }

      case "/live/clip/get/playing_position": {
        const track = toNumber(args[0], -1);
        const clip = toNumber(args[1], -1);
        if (this.isActiveClip(track, clip)) {
          this.handlePlayingPosition(toNumber(args[2], 0));
          this.emit();
        }
        return;
      }

      case "/live/scene/get/color": {
        const scene = toNumber(args[0], -1);
        if (this.activeScene !== null && scene === this.activeScene) {
          this.sceneColor = toColorValue(args[1]);
          this.emit();
        }
        return;
      }

      case "/live/scene/get/name": {
        const scene = toNumber(args[0], -1);
        if (this.activeScene !== null && scene === this.activeScene) {
          this.sceneName = toStringValue(args[1]);
          this.emit();
        }
        return;
      }

      case "/live/song/get/beat": {
        this.beatCounter = Math.max(
          0,
          Math.round(toNumber(args[0], this.beatCounter)),
        );
        this.beatFlashToken += 1;
        this.emit();
        return;
      }

      case "/live/song/get/is_playing": {
        this.isPlaying = toBoolean(args[0]);
        this.emit();
        return;
      }

      case "/live/song/get/signature_denominator": {
        this.signatureDenominator = Math.max(
          1,
          Math.round(toNumber(args[0], this.signatureDenominator)),
        );
        this.emit();
        return;
      }

      case "/live/song/get/signature_numerator": {
        this.signatureNumerator = Math.max(
          1,
          Math.round(toNumber(args[0], this.signatureNumerator)),
        );
        this.emit();
        return;
      }

      case "/live/track/get/color": {
        const track = toNumber(args[0], -1);
        if (this.selectedTrack !== null && track === this.selectedTrack) {
          this.trackColor = toColorValue(args[1]);
          this.emit();
        }
        return;
      }

      case "/live/track/get/name": {
        const track = toNumber(args[0], -1);
        if (this.selectedTrack !== null && track === this.selectedTrack) {
          this.trackName = toStringValue(args[1]);
          this.emit();
        }
        return;
      }

      case "/live/track/get/playing_slot_index": {
        const track = toNumber(args[0], -1);
        const slot = toNumber(args[1], -1);
        if (this.selectedTrack !== null && track === this.selectedTrack) {
          this.handlePlayingSlot(slot);
        }
        return;
      }

      case "/live/view/get/selected_track": {
        this.handleSelectedTrack(toNumber(args[0], -1));
        return;
      }

      default:
        return;
    }
  }

  private handlePlayingPosition(position: number): void {
    if (this.currentPosition === null) {
      this.launchPosition = position;
      this.currentPosition = position;
      this.previousPosition = position;
      this.loopWrapCount = 0;
      return;
    }

    const previous = this.currentPosition;
    if (position < previous - EPSILON) {
      if (this.isNaturalLoopWrap(previous, position)) {
        this.loopWrapCount += 1;
      } else {
        // Relaunch or transport jump on the same clip: reset elapsed baseline.
        this.launchPosition = position;
        this.loopWrapCount = 0;
      }
    }

    this.previousPosition = previous;
    this.currentPosition = position;
    this.launchPosition ??= position;
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

    if (
      this.activeClip?.track === this.selectedTrack &&
      this.activeClip.clip === slotIndex
    ) {
      return;
    }

    this.clearClipSubscription();

    this.activeClip = { clip: slotIndex, track: this.selectedTrack };
    this.clipName = null;
    this.clipColor = null;
    this.activeScene = slotIndex;
    this.sceneName = null;
    this.sceneColor = null;
    this.clipMeta = {
      length: 4,
      loopEnd: 4,
      looping: false,
      loopStart: 0,
    };
    this.resetClipRunState();

    this.send("/live/clip/start_listen/playing_position", [
      this.selectedTrack,
      slotIndex,
    ]);
    this.send("/live/clip/get/playing_position", [
      this.selectedTrack,
      slotIndex,
    ]);
    this.send("/live/clip/get/name", [this.selectedTrack, slotIndex]);
    this.send("/live/clip/get/color", [this.selectedTrack, slotIndex]);
    this.send("/live/clip/get/length", [this.selectedTrack, slotIndex]);
    this.send("/live/clip/get/loop_start", [this.selectedTrack, slotIndex]);
    this.send("/live/clip/get/loop_end", [this.selectedTrack, slotIndex]);
    this.send("/live/clip/get/looping", [this.selectedTrack, slotIndex]);
    this.send("/live/scene/start_listen/name", [slotIndex]);
    this.send("/live/scene/get/name", [slotIndex]);
    this.send("/live/scene/start_listen/color", [slotIndex]);
    this.send("/live/scene/get/color", [slotIndex]);

    this.emit();
  }

  private handleSelectedTrack(trackIndex: number): void {
    if (trackIndex < 0) {
      return;
    }

    if (
      this.trackLocked &&
      this.selectedTrack !== null &&
      this.selectedTrack !== trackIndex
    ) {
      this.pendingSelectedTrack = trackIndex;
      return;
    }

    this.pendingSelectedTrack = null;
    this.applySelectedTrack(trackIndex);
  }

  private isActiveClip(track: number, clip: number): boolean {
    return this.activeClip?.track === track && this.activeClip.clip === clip;
  }

  private isNaturalLoopWrap(
    previousPosition: number,
    currentPosition: number,
  ): boolean {
    if (!hasValidLoopSpan(this.clipMeta)) {
      return false;
    }

    const loopSpan = this.clipMeta.loopEnd - this.clipMeta.loopStart;
    const wrappedDelta = currentPosition + loopSpan - previousPosition;

    return (
      previousPosition >= this.clipMeta.loopStart - EPSILON &&
      previousPosition <= this.clipMeta.loopEnd + EPSILON &&
      currentPosition >= this.clipMeta.loopStart - EPSILON &&
      currentPosition <= this.clipMeta.loopEnd + EPSILON &&
      wrappedDelta >= -EPSILON &&
      wrappedDelta <= loopSpan + 1
    );
  }

  private resetClipRunState(): void {
    this.launchPosition = null;
    this.currentPosition = null;
    this.previousPosition = null;
    this.loopWrapCount = 0;
  }

  private send(address: string, args: unknown[] = []): void {
    this.port.send({ address, args });
  }
}

/**
 * Unwraps OSC argument payloads that use `{ value }` envelopes.
 * @param value - The raw OSC argument value.
 * @returns The unwrapped value when present, otherwise the original input.
 */
function argValue(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in value) {
    return (value as { value: unknown }).value;
  }
  return value;
}

/**
 * Creates zeroed counter parts for initial HUD state.
 * @returns A counter parts object with all fields set to `0`.
 */
function defaultCounterParts(): CounterParts {
  return {
    bar: 0,
    beat: 0,
    sixteenth: 0,
  };
}

/**
 * Converts an OSC argument to a boolean value.
 * @param value - The raw OSC argument value.
 * @returns The normalized boolean representation.
 */
function toBoolean(value: unknown): boolean {
  const resolved = argValue(value);
  if (typeof resolved === "boolean") {
    return resolved;
  }
  if (typeof resolved === "number") {
    return resolved !== 0;
  }
  if (typeof resolved === "string") {
    const lowered = resolved.toLowerCase();
    return lowered === "true" || lowered === "1";
  }
  return false;
}

/**
 * Converts an OSC color value to a normalized 24-bit RGB integer.
 * @param value - The raw OSC argument value.
 * @returns A normalized RGB integer, or `null` when parsing fails.
 */
function toColorValue(value: unknown): null | number {
  const parsed = Number(argValue(value));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  // Live color values can arrive as signed ints; normalize to 24-bit RGB.
  return (Math.round(parsed) >>> 0) & 0xffffff;
}

/**
 * Converts an OSC argument to a finite number.
 * @param value - The raw OSC argument value.
 * @param fallback - The value returned when parsing fails.
 * @returns The parsed number or the fallback.
 */
function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(argValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Converts an OSC argument to a string when possible.
 * @param value - The raw OSC argument value.
 * @returns The parsed string, or an empty string for unsupported values.
 */
function toStringValue(value: unknown): string {
  const resolved = argValue(value);
  if (typeof resolved === "string") {
    return resolved;
  }

  if (
    typeof resolved === "number" ||
    typeof resolved === "boolean" ||
    typeof resolved === "bigint" ||
    typeof resolved === "symbol"
  ) {
    return String(resolved);
  }

  return "";
}
