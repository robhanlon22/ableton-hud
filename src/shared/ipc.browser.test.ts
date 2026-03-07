import { describe, expect, it } from "vitest";

import { CompactViewRequestSchema, createDefaultHudState } from "./ipc";

describe("CompactViewRequestSchema", () => {
  it("accepts disabled requests without dimensions", () => {
    // arrange
    const payload = { enabled: false };

    // act
    const parsed = CompactViewRequestSchema.parse(payload);

    // assert
    expect(parsed).toEqual({ enabled: false });
  });

  it("accepts enabled requests with dimensions", () => {
    // arrange
    const payload = { enabled: true, height: 120, width: 240 };

    // act
    const parsed = CompactViewRequestSchema.parse(payload);

    // assert
    expect(parsed).toEqual(payload);
  });

  it("rejects enabled requests when both dimensions are missing", () => {
    // arrange
    const payload = { enabled: true };

    // act
    const result = CompactViewRequestSchema.safeParse(payload);

    // assert
    expect(result.success).toBe(false);
  });

  it("rejects enabled requests when width is missing", () => {
    // arrange
    const payload = { enabled: true, height: 120 };

    // act
    const result = CompactViewRequestSchema.safeParse(payload);

    // assert
    expect(result.success).toBe(false);
  });

  it("rejects enabled requests when height is missing", () => {
    // arrange
    const payload = { enabled: true, width: 240 };

    // act
    const result = CompactViewRequestSchema.safeParse(payload);

    // assert
    expect(result.success).toBe(false);
  });
});

describe("createDefaultHudState", () => {
  it("defaults always-on-top to enabled", () => {
    // arrange
    // act
    const state = createDefaultHudState();

    // assert
    expect(state.alwaysOnTop).toBe(true);
  });
});
