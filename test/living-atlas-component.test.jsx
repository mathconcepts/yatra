import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const maps = [];
vi.mock("maplibre-gl", () => {
  class Map {
    constructor(opts) {
      this.opts = opts; this.handlers = {}; this.sources = {}; this.layers = []; maps.push(this);
      this.getCanvas = () => ({ style: {} });
    }
    on(ev, a, b) { (this.handlers[ev + (typeof a === "string" ? ":" + a : "")] ??= []).push(b ?? a); }
    addControl() {}
    addSource(id) { this.sources[id] = { data: null, setData(d) { this.data = d; } }; }
    addLayer(l) { this.layers.push(l.id); }
    getSource(id) { return this.sources[id]; }
    fitBounds(b) { this.fit = b; }
    remove() { this.removed = true; }
    fire(ev, payload) { (this.handlers[ev] ?? []).forEach((h) => h(payload)); }
  }
  return { default: { Map, NavigationControl: class {} } };
});

import LivingAtlas from "../src/components/living/LivingAtlas.jsx";
import { LOCATIONS } from "../src/config";

const start = () => maps[maps.length - 1];
const loaded = () => act(() => { start().fire("load"); });

beforeEach(() => {
  maps.length = 0;
  window.history.replaceState({}, "", "/?surface=living-atlas&t=2026-10-09T12:00&speed=20m");
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe("<LivingAtlas />", () => {
  it("renders the derived title counts, the clock from the URL and the sources footer", () => {
    render(<LivingAtlas locations={LOCATIONS} />);
    expect(screen.getByText("Where The Journeys Are")).toBeInTheDocument();
    expect(screen.getByText(/4 journeys · 1 timetabled service · 3 walking paths/)).toBeInTheDocument();
    expect(screen.getByText("12:00")).toBeInTheDocument();
    expect(screen.getByText(/Scheduled, not tracked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fri" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "20m" })).toHaveAttribute("aria-pressed", "true");
  });

  it("fits the registry's bounds on load and pushes GeoJSON to the map", () => {
    render(<LivingAtlas locations={LOCATIONS} />);
    loaded();
    const m = start();
    expect(m.fit).toBeTruthy();
    expect(m.layers).toContain("la-movers");
    expect(m.sources["la-movers"].data.features.length).toBeGreaterThan(0);
    expect(m.sources["la-lines"].data.features.length).toBeGreaterThan(0);
  });

  it("day tabs rewrite the clock; the scrubber stops playback", () => {
    render(<LivingAtlas locations={LOCATIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Move the clock"), { target: { value: "300" } });
    expect(screen.getByText("05:00")).toBeInTheDocument();
  });

  it("Play the day advances the clock, Pause stops it, Live follows the wall clock", () => {
    render(<LivingAtlas locations={LOCATIONS} />);
    fireEvent.click(screen.getByRole("button", { name: /Play the day/ }));
    act(() => { vi.advanceTimersByTime(3000); }); // 3 s at 20m/s = 60 min
    expect(screen.getByText("13:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("13:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Live/ }));
    expect(screen.getByRole("button", { name: /Live/ })).toHaveAttribute("aria-pressed", "true");
    act(() => { vi.advanceTimersByTime(200); }); // live tick runs
    fireEvent.click(screen.getByRole("button", { name: "1m" }));
    expect(screen.getByRole("button", { name: "1m" })).toHaveAttribute("aria-pressed", "true");
  });

  it("filters the list and selects a journey whose sources then show", () => {
    render(<LivingAtlas locations={LOCATIONS} />);
    fireEvent.click(screen.getByRole("button", { name: /All 4/ }));
    const row = screen.getByRole("button", { name: /Yadagiri Hill/ });
    fireEvent.click(row);
    expect(screen.getByText(/Sources & method · Yadagiri Hill/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Moving" }));
    fireEvent.change(screen.getByLabelText("Move the clock"), { target: { value: "120" } });
    expect(screen.getByText(/Nothing is moving at this hour/)).toBeInTheDocument();
  });

  it("clicking a dot opens that journey, carrying the clock", () => {
    const onOpenJourney = vi.fn();
    render(<LivingAtlas locations={LOCATIONS} onOpenJourney={onOpenJourney} />);
    loaded();
    act(() => { start().fire("click:la-movers", { features: [{ properties: { journeyId: "konkan-railway" } }] }); });
    const [id, href] = onOpenJourney.mock.calls[0];
    expect(id).toBe("konkan-railway");
    expect(href).toContain("surface=atlas");
    expect(href).toContain("location=konkan-railway");
    expect(href).toContain("from=living-atlas");
    expect(href).toContain("t=2026-10-09T12%3A00");
    act(() => { start().fire("click:la-anchors", { features: [] }); }); // click on nothing is ignored
    expect(onOpenJourney).toHaveBeenCalledTimes(1);
  });

  it("without onOpenJourney the dot click navigates by URL", () => {
    const assign = vi.fn();
    const real = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...real, search: real.search, assign } });
    render(<LivingAtlas locations={LOCATIONS} />);
    loaded();
    act(() => { start().fire("click:la-movers", { features: [{ properties: { journeyId: "yadagirigutta" } }] }); });
    expect(assign).toHaveBeenCalled();
    Object.defineProperty(window, "location", { configurable: true, value: real });
  });

  it("writes the clock back to the URL (debounced)", () => {
    render(<LivingAtlas locations={LOCATIONS} />);
    fireEvent.change(screen.getByLabelText("Move the clock"), { target: { value: "600" } });
    act(() => { vi.advanceTimersByTime(500); });
    expect(window.location.search).toContain("t=2026-10-09T10%3A00");
    expect(window.location.search).toContain("surface=living-atlas");
  });

  it("starts live when the URL has no t, and offers a way back", () => {
    window.history.replaceState({}, "", "/?surface=living-atlas");
    const onCancel = vi.fn();
    render(<LivingAtlas locations={LOCATIONS} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: /Live/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Back to the atlas/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows a message instead of crashing when the map cannot start, and cleans up on unmount", async () => {
    const mod = await import("maplibre-gl");
    const Real = mod.default.Map;
    mod.default.Map = function () { throw new Error("no webgl"); };
    const { unmount } = render(<LivingAtlas locations={LOCATIONS} />);
    expect(screen.getByText(/Map unavailable: no webgl/)).toBeInTheDocument();
    unmount();
    mod.default.Map = Real;
    const second = render(<LivingAtlas locations={LOCATIONS} />);
    second.unmount();
    expect(start().removed).toBe(true);
  });
});
