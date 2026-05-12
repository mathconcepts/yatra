import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AutoCameraPill from "../src/components/reels/AutoCameraPill";

describe("AutoCameraPill", () => {
  it("renders the auto label when mode=auto", () => {
    render(<AutoCameraPill mode="auto" manualKey={0} onToggle={() => {}} />);
    expect(screen.getByText("Auto camera")).toBeInTheDocument();
  });

  it("renders the manual label when mode=manual", () => {
    render(<AutoCameraPill mode="manual" manualKey={0} onToggle={() => {}} />);
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("aria-pressed reflects auto mode", () => {
    const { rerender } = render(<AutoCameraPill mode="auto" manualKey={0} onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    rerender(<AutoCameraPill mode="manual" manualKey={0} onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("uses different aria-label text per mode", () => {
    const { rerender } = render(<AutoCameraPill mode="auto" manualKey={0} onToggle={() => {}} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/take manual control/i);
    rerender(<AutoCameraPill mode="manual" manualKey={0} onToggle={() => {}} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/resume auto/i);
  });

  it("calls onToggle on click", () => {
    const onToggle = vi.fn();
    render(<AutoCameraPill mode="auto" manualKey={0} onToggle={onToggle} />);
    screen.getByRole("button").click();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("applies a class scoped to the mode", () => {
    const { rerender, container } = render(<AutoCameraPill mode="auto" manualKey={0} onToggle={() => {}} />);
    expect(container.querySelector(".auto-pill-auto")).toBeInTheDocument();
    rerender(<AutoCameraPill mode="manual" manualKey={0} onToggle={() => {}} />);
    expect(container.querySelector(".auto-pill-manual")).toBeInTheDocument();
  });

  it("only renders the countdown bar in manual mode", () => {
    const { rerender, container } = render(<AutoCameraPill mode="auto" manualKey={0} onToggle={() => {}} />);
    expect(container.querySelector(".auto-pill-countdown")).not.toBeInTheDocument();
    rerender(<AutoCameraPill mode="manual" manualKey={0} onToggle={() => {}} />);
    expect(container.querySelector(".auto-pill-countdown")).toBeInTheDocument();
  });
});
