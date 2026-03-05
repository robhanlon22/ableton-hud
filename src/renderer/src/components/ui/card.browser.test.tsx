import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./card";

describe("Card primitives", () => {
  it("renders all card slots including title", async () => {
    // arrange
    await render(
      <Card data-testid="card-root">
        <CardHeader>
          <CardTitle>Timing HUD</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    const root = page.getByTestId("card-root");
    // act
    const title = page.getByText("Timing HUD");

    // assert
    await expect.element(root).toHaveClass("rounded-md");
    await expect.element(title).toHaveTextContent("Timing HUD");
    await expect.element(title).toHaveClass("uppercase");
    await expect.element(page.getByText("Body")).toBeInTheDocument();
    await expect.element(page.getByText("Footer")).toBeInTheDocument();
  });
});
