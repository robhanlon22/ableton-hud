import { z } from "zod";

const DEFAULT_SCENE_ID = 301;
const DEFAULT_TRACK_ID = 5;
const DEFAULT_CLIP_SLOT_ID = 101;
const DEFAULT_NUMERATOR = 4;
const DEFAULT_DENOMINATOR = 4;
const DEFAULT_CLIP_LENGTH_BEATS = 64;
const DEFAULT_TRACK_COLOR = 0xff_d0_00;

const wireMessageSchema = z.object({
  action: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  path: z.string().optional(),
  uuid: z.string().optional(),
});

export interface ClipSlotState {
  clip: ClipState;
  hasClip: boolean;
  id: number;
}

export interface ClipState {
  color: number;
  length: number;
  loopEnd: number;
  looping: boolean;
  loopStart: number;
  name: string;
  playingPosition: number;
}

export interface FakeLiveSnapshot {
  scenes: SceneState[];
  selectedTrackId: number;
  song: SongState;
  tracks: TrackState[];
}

export interface ObserverReference {
  eventId: string;
  path: string;
  property: string;
}

export interface SceneState {
  color: number;
  id: number;
  name: string;
}

export interface SongState {
  currentSongTime: number;
  isPlaying: boolean;
  signatureDenominator: number;
  signatureNumerator: number;
}

export interface StartFakeServerOptions {
  port?: number;
}

export interface TrackState {
  clipSlots: ClipSlotState[];
  color: number;
  hasAudioInput: boolean;
  id: number;
  name: string;
  playingSlotIndex: number;
}

export type WireMessage = z.infer<typeof wireMessageSchema>;

export const DEFAULT_SNAPSHOT: FakeLiveSnapshot = {
  scenes: [
    {
      color: 0,
      id: DEFAULT_SCENE_ID,
      name: "Scene A",
    },
  ],
  selectedTrackId: DEFAULT_TRACK_ID,
  song: {
    currentSongTime: 0,
    isPlaying: true,
    signatureDenominator: DEFAULT_DENOMINATOR,
    signatureNumerator: DEFAULT_NUMERATOR,
  },
  tracks: [
    {
      clipSlots: [
        {
          clip: {
            color: DEFAULT_TRACK_COLOR,
            length: DEFAULT_CLIP_LENGTH_BEATS,
            loopEnd: DEFAULT_CLIP_LENGTH_BEATS,
            looping: false,
            loopStart: 0,
            name: "Build",
            playingPosition: 0,
          },
          hasClip: true,
          id: DEFAULT_CLIP_SLOT_ID,
        },
      ],
      color: DEFAULT_TRACK_COLOR,
      hasAudioInput: false,
      id: DEFAULT_TRACK_ID,
      name: "Track A",
      playingSlotIndex: 0,
    },
  ],
};

/**
 * Builds the websocket path for a clip object.
 * @param trackIndex - Track index in the fake snapshot.
 * @param slotIndex - Clip-slot index in the fake snapshot.
 * @returns Clip object path used by the Ableton websocket bridge.
 */
export function buildClipPath(trackIndex: number, slotIndex: number): string {
  return `live_set tracks ${String(trackIndex)} clip_slots ${String(slotIndex)} clip`;
}

/**
 * Builds the websocket path for a clip slot object.
 * @param trackIndex - Track index in the fake snapshot.
 * @param slotIndex - Clip-slot index in the fake snapshot.
 * @returns Clip-slot path used by the Ableton websocket bridge.
 */
export function buildClipSlotPath(
  trackIndex: number,
  slotIndex: number,
): string {
  return `live_set tracks ${String(trackIndex)} clip_slots ${String(slotIndex)}`;
}

/**
 * Parses a websocket wire payload into a normalized message.
 * @param raw - Raw JSON payload received from the client.
 * @returns Parsed wire message with optional fields preserved.
 */
export function parseWireMessage(raw: string): WireMessage {
  return wireMessageSchema.parse(JSON.parse(raw));
}

/**
 * Converts a dynamic wire value to a numeric index when possible.
 * @param value - Raw argument value from the websocket payload.
 * @returns A finite number, or `undefined` if parsing fails.
 */
export function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Decodes websocket raw payload bytes into UTF-8 text.
 * @param payload - Raw payload from the ws message callback.
 * @returns UTF-8 decoded string payload.
 */
export function toUtf8String(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }
  if (Array.isArray(payload)) {
    const buffers = payload.map((part) => {
      return Buffer.isBuffer(part) ? part : Buffer.from(part);
    });
    return Buffer.concat(buffers).toString("utf8");
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString("utf8");
  }
  return "";
}

/**
 * Normalizes a websocket wire field to a string.
 * @param value - Raw wire value.
 * @returns String value for primitive inputs, otherwise an empty string.
 */
export function toWireString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
