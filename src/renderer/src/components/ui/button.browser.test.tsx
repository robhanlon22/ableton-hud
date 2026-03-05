import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Button } from "./button";

describe("Button", () => {
  it("renders a native button by default", async () => {
    // arrange
    await render(<Button>Run</Button>);

    // act
    const button = page.getByRole("button", { name: "Run" });
    // assert
    await expect.element(button).toBeInTheDocument();
    await expect.element(button).toHaveTextContent("Run");
  });

  it("renders child component when asChild is true", async () => {
    // arrange
    await render(
      <Button asChild>
        <a href="#run">Run Link</a>
      </Button>,
    );

    // act
    const link = page.getByRole("link", { name: "Run Link" });
    // assert
    await expect.element(link).toBeInTheDocument();
    await expect.element(link).toHaveAttribute("href", "#run");
    await expect.element(link).toHaveClass("inline-flex");
  });

  it("applies explicit variant and size classes", async () => {
    // arrange
    await render(
      <div>
        <Button size="lg" variant="active">
          Active
        </Button>
        <Button size="sm" variant="ghost">
          Ghost
        </Button>
      </div>,
    );

    const activeButton = page.getByRole("button", { name: "Active" });
    // act
    const ghostButton = page.getByRole("button", { name: "Ghost" });
    // assert
    await expect.element(activeButton).toHaveClass("h-9");
    await expect.element(activeButton).toHaveClass("border-ableton-accent");
    await expect.element(ghostButton).toHaveClass("h-7");
    await expect.element(ghostButton).toHaveClass("text-ableton-muted");
  });
});
