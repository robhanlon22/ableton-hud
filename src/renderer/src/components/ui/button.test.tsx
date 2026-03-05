import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders a native button by default", () => {
    render(<Button>Run</Button>);

    const button = screen.getByRole("button", { name: "Run" });
    expect(button.tagName).toBe("BUTTON");
  });

  it("renders child component when asChild is true", () => {
    render(
      <Button asChild>
        <a href="#run">Run Link</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Run Link" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveClass("inline-flex");
  });
});
