import { expect, it } from "vitest";

it("evaluates the shared types module via its runtime marker", async () => {
  // arrange

  // act
  const sharedTypesModule = await import("@shared/types");

  // assert
  expect(sharedTypesModule.SHARED_TYPES_MODULE).toBe(true);
});
