import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./card";

describe("Card primitives", () => {
  it("renders all card slots including title", () => {
    render(
      <Card data-testid="card-root">
        <CardHeader>
          <CardTitle>Timing HUD</CardTitle>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );

    expect(screen.getByTestId("card-root")).toHaveClass("rounded-md");
    expect(screen.getByText("Timing HUD")).toHaveClass("uppercase");
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });
});
