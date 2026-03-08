import { AbletonLive } from "ableton-live";

import type {
  LiveClient,
  LiveFactory,
  NormalizedSelectedTrackPayload,
  NormalizedTrackReference,
  ObserverCleanup,
  PayloadNormalizers,
} from "./types";

import {
  DEFAULT_BRIDGE_PORT,
  MAX_PORT_NUMBER,
  MAX_RGB_COLOR,
  MIN_PORT_NUMBER,
} from "./types";

const TRACK_PATH_PATTERN = /tracks\s+(\d+)/u;

interface DefaultLiveFactoryOptions {
  host: string;
  port: number;
}

/**
 * Parses a zero-based track index from a Live track path string.
 * @param path - Track path value such as `live_set tracks 2`.
 * @returns The track index, or `-1` when unavailable.
 */
export function parseTrackIndexFromPath(path: string | undefined): number {
  if (typeof path !== "string" || path.length === 0) {
    return -1;
  }

  const capturedIndex = TRACK_PATH_PATTERN.exec(path)?.[1];
  return capturedIndex === undefined ? -1 : Number.parseInt(capturedIndex, 10);
}

/**
 * Resolves the bridge TCP port from environment input.
 * @param value - Optional environment override.
 * @returns A valid TCP port, defaulting to `9001`.
 */
export function resolveLivePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_BRIDGE_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_PORT_NUMBER ||
    parsed > MAX_PORT_NUMBER
  ) {
    return DEFAULT_BRIDGE_PORT;
  }

  return parsed;
}

/**
 * Converts unknown input into a boolean flag.
 * @param value - The value to normalize.
 * @returns The normalized boolean representation.
 */
export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    return lowered === "true" || lowered === "1";
  }

  return false;
}

/**
 * Converts a color value into a normalized 24-bit RGB integer.
 * @param value - The color value to parse.
 * @returns The normalized RGB integer, or `undefined` when parsing fails.
 */
export function toColorValue(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return (Math.round(parsed) >>> 0) & MAX_RGB_COLOR;
}

/**
 * Converts unknown input into a finite number.
 * @param value - The value to parse.
 * @param fallback - The fallback when parsing fails.
 * @returns The parsed number or fallback.
 */
export function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Converts scene color values, treating `0` as "no color".
 * @param value - Raw scene color value from Live.
 * @returns The normalized RGB color, or `undefined` when the scene has no color.
 */
export function toSceneColorValue(value: unknown): number | undefined {
  const color = toColorValue(value);
  return color === undefined || color === 0 ? undefined : color;
}

/**
 * Converts unknown input to a string when supported.
 * @param value - The value to normalize.
 * @returns The string representation, or an empty string for unsupported values.
 */
export function toStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }

  return "";
}

/**
 * Checks whether an unknown cleanup value matches the observer-cleanup contract.
 * @param cleanup - The candidate cleanup value.
 * @returns Whether the value is a callable observer cleanup.
 */
function isObserverCleanup(cleanup: unknown): cleanup is ObserverCleanup {
  return typeof cleanup === "function";
}

/**
 * Normalizes observer cleanup callbacks.
 * @param cleanup - The raw cleanup payload.
 * @returns The callable cleanup when present.
 */
function normalizeCleanup(cleanup: unknown): ObserverCleanup | undefined {
  return isObserverCleanup(cleanup) ? cleanup : undefined;
}

/**
 * Normalizes the selected-track payload emitted by Live.
 * @param payload - The raw selected-track payload.
 * @returns The normalized payload representation.
 */
function normalizeSelectedTrackPayload(
  payload: unknown,
): NormalizedSelectedTrackPayload {
  if (typeof payload === "number" && Number.isInteger(payload)) {
    return {
      directId: payload,
      path: undefined,
      rawPath: undefined,
    };
  }

  const record = toRecord(payload);
  const rawRecord = toRecord(record.raw);
  return {
    directId: undefined,
    path: readString(record.path),
    rawPath: readString(rawRecord.path),
  };
}

/**
 * Normalizes a Live track reference payload.
 * @param track - The raw track payload.
 * @returns The normalized track reference.
 */
function normalizeTrackReference(track: unknown): NormalizedTrackReference {
  const record = toRecord(track);
  const rawRecord = toRecord(record.raw);
  const directId =
    typeof record.id === "number" && Number.isFinite(record.id)
      ? record.id
      : undefined;

  return {
    id: directId,
    path: readString(record.path),
    rawId: toFiniteNumber(rawRecord.id),
    rawPath: readString(rawRecord.path),
  };
}

/**
 * Reads a string value when present.
 * @param value - The value to inspect.
 * @returns The string, or `undefined` when unavailable.
 */
function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Converts unknown input to a finite number when possible.
 * @param value - The value to parse.
 * @returns The parsed number, or `undefined` for non-finite values.
 */
function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Converts an unknown value into a record when possible.
 * @param value - The value to inspect.
 * @returns The normalized record.
 */
function toRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return {};
  }

  const recordSource = value;
  const record: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(recordSource)) {
    record[key] = entryValue;
  }
  return record;
}

export const defaultPayloadNormalizers: PayloadNormalizers = {
  normalizeCleanup,
  normalizeSelectedTrackPayload,
  normalizeTrackRef: normalizeTrackReference,
  parseTrackIndexFromPath,
  toBoolean,
  toColorValue,
  toNumber,
  toSceneColorValue,
  toStringValue,
};

/**
 * Creates a Live client from factory options.
 * @param options - Host and port configuration for the Live bridge.
 * @returns The constructed Live client.
 */
function createDefaultLiveClient(
  options: DefaultLiveFactoryOptions,
): LiveClient {
  return createLiveClient(options.host, options.port);
}

/**
 * Creates a typed Ableton Live client wrapper.
 * @param host - Connection host for the Live websocket bridge.
 * @param port - Connection port for the Live websocket bridge.
 * @returns The constructed Live client.
 */
function createLiveClient(host: string, port: number): LiveClient {
  const liveClient = new AbletonLive({ host, port });
  if (liveClient.song !== undefined && liveClient.songView !== undefined) {
    return liveClient;
  }

  throw new TypeError("Ableton Live client did not expose song surfaces.");
}

export const defaultLiveFactory: LiveFactory = {
  create: createDefaultLiveClient,
};
