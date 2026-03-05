import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { Separator } from "./separator";

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

describe("Separator", () => {
  it("renders horizontal separator by default", async () => {
    const view = await render(<Separator />);

    const separator = requiredElement(view.container, ":scope > *");
    expect(separator.className).toContain("h-px");
    expect(separator.className).toContain("w-full");
  });

  it("renders vertical separator when requested", async () => {
    const view = await render(<Separator orientation="vertical" />);

    const separator = requiredElement(view.container, ":scope > *");
    expect(separator.className).toContain("h-full");
    expect(separator.className).toContain("w-px");
  });

  it("passes through decorative and custom class props", async () => {
    const view = await render(
      <Separator className="custom-separator" decorative={false} />,
    );

    const separator = requiredElement(view.container, ":scope > *");
    expect(separator.getAttribute("aria-hidden")).not.toBe("true");
    expect(separator.className).toContain("custom-separator");
  });
});
