import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import SurfaceRouter from "../src/components/SurfaceRouter";

beforeEach(() => {
  // Reset localStorage and URL between tests so override state doesn't leak.
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("SurfaceRouter (render)", () => {
  it("renders the atlas slot at landscape desktop dimensions", () => {
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    render(<SurfaceRouter atlas={<div data-testid="atlas">atlas-here</div>} locationId="x" locations={{}} />);
    expect(screen.getByTestId("atlas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /switch to reels mode/i })).toBeInTheDocument();
  });
});
