import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { Button } from "./button";

/**
 * Resolves a required HTMLElement by selector.
 * @param root - Root element to query.
 * @param selector - CSS selector.
 * @returns Matching HTMLElement.
 */
function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      `Expected selector ${selector} to resolve to an HTMLElement.`,
    );
  }
  return element;
}

describe("Button", () => {
  it("renders a native button by default", async () => {
    const view = await render(<Button>Run</Button>);

    const button = requiredElement(view.container, "button");
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toBe("Run");
  });

  it("renders child component when asChild is true", async () => {
    const view = await render(
      <Button asChild>
        <a href="#run">Run Link</a>
      </Button>,
    );

    const link = requiredElement(view.container, "a[href='#run']");
    expect(link.tagName).toBe("A");
    expect(link.className).toContain("inline-flex");
  });

  it("applies explicit variant and size classes", async () => {
    const view = await render(
      <div>
        <Button size="lg" variant="active">
          Active
        </Button>
        <Button size="sm" variant="ghost">
          Ghost
        </Button>
      </div>,
    );

    const activeButton = requiredElement(
      view.container,
      "button:nth-of-type(1)",
    );
    const ghostButton = requiredElement(
      view.container,
      "button:nth-of-type(2)",
    );
    expect(activeButton.className).toContain("h-9");
    expect(activeButton.className).toContain("border-ableton-accent");
    expect(ghostButton.className).toContain("h-7");
    expect(ghostButton.className).toContain("text-ableton-muted");
  });
});
