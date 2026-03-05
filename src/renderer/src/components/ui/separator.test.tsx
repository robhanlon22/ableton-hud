import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Separator } from "./separator";

describe("Separator", () => {
  it("renders horizontal separator by default", () => {
    const { container } = render(<Separator />);

    expect(container.firstElementChild).toHaveClass("h-px", "w-full");
  });

  it("renders vertical separator when requested", () => {
    const { container } = render(<Separator orientation="vertical" />);

    expect(container.firstElementChild).toHaveClass("h-full", "w-px");
  });
});
