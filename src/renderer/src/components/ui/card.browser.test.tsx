import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./card";

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

describe("Card primitives", () => {
  it("renders all card slots including title", async () => {
    const view = await render(
      <Card data-testid="card-root">
        <CardHeader>
          <CardTitle>Timing HUD</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    const root = requiredElement(view.container, "[data-testid='card-root']");
    const title = requiredElement(view.container, "div[class*='uppercase']");

    expect(root.className).toContain("rounded-md");
    expect(title.textContent).toBe("Timing HUD");
    expect(title.className).toContain("uppercase");
    expect(view.container.textContent).toContain("Body");
    expect(view.container.textContent).toContain("Footer");
  });
});
