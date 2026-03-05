import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Separator } from "./separator";

describe("Separator", () => {
  it("renders horizontal separator by default", async () => {
    await render(<Separator data-testid="separator" />);

    const separator = page.getByTestId("separator");
    await expect.element(separator).toHaveClass("h-px");
    await expect.element(separator).toHaveClass("w-full");
  });

  it("renders vertical separator when requested", async () => {
    await render(<Separator data-testid="separator" orientation="vertical" />);

    const separator = page.getByTestId("separator");
    await expect.element(separator).toHaveClass("h-full");
    await expect.element(separator).toHaveClass("w-px");
  });

  it("passes through decorative and custom class props", async () => {
    await render(
      <Separator
        className="custom-separator"
        data-testid="separator"
        decorative={false}
      />,
    );

    const separator = page.getByTestId("separator");
    await expect.element(separator).not.toHaveAttribute("aria-hidden");
    await expect.element(separator).toHaveClass("custom-separator");
  });
});
