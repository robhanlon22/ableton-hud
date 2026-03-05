import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Separator } from "./separator";

describe("Separator", () => {
  it("renders horizontal separator by default", async () => {
    // arrange
    await render(<Separator data-testid="separator" />);

    // act
    const separator = page.getByTestId("separator");
    // assert
    await expect.element(separator).toHaveClass("h-px");
    await expect.element(separator).toHaveClass("w-full");
  });

  it("renders vertical separator when requested", async () => {
    // arrange
    await render(<Separator data-testid="separator" orientation="vertical" />);

    // act
    const separator = page.getByTestId("separator");
    // assert
    await expect.element(separator).toHaveClass("h-full");
    await expect.element(separator).toHaveClass("w-px");
  });

  it("passes through decorative and custom class props", async () => {
    // arrange
    await render(
      <Separator
        className="custom-separator"
        data-testid="separator"
        decorative={false}
      />,
    );

    // act
    const separator = page.getByTestId("separator");
    // assert
    await expect.element(separator).not.toHaveAttribute("aria-hidden");
    await expect.element(separator).toHaveClass("custom-separator");
  });
});
