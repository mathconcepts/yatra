import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReelFeed, { clampIndex } from "../src/components/reels/ReelFeed";

// MapLibre needs WebGL — stub MapView so ReelPlayer renders harmlessly in jsdom.
vi.mock("../src/components/MapView", () => ({
  default: ({ config }) => <div data-testid="mapview-stub">{config.id}</div>,
}));

const FIXTURE = {
  "tirupati-tirumala": {
    id: "tirupati-tirumala",
    title: "Tirupati → Tirumala",
    subtitle: "Sacred ascent",
    bounds: { latMin: 13.6, latMax: 13.7, lonMin: 79.3, lonMax: 79.4 },
    origin: { name: "Tirupati", lat: 13.6, lon: 79.4, elev: 182 },
    destination: { name: "Tirumala", lat: 13.7, lon: 79.3, elev: 853 },
    routes: [{
      id: "alipiri",
      name: "Alipiri Mettu",
      color: "#3b82f6",
      difficulty: "Moderate",
      stats: { distanceKm: 11, durationHr: 4 },
      waypoints: [
        { lat: 13.6, lon: 79.4, elev: 182 },
        { lat: 13.7, lon: 79.3, elev: 853 },
      ],
    }],
    landmarks: [{
      id: "gate", name: "Alipiri Gate",
      lat: 13.63, lon: 79.39, elev: 220, type: "gateway",
      blurb: "The traditional starting arch.",
    }],
    topography: { basemap: "topo", zoom: 12 },
  },
  "konkan-railway": {
    id: "konkan-railway",
    title: "Konkan Railway",
    subtitle: "Mumbai → Mangaluru",
    bounds: { latMin: 12.8, latMax: 19.0, lonMin: 73.0, lonMax: 75.0 },
    origin: { name: "Mumbai", lat: 19.0, lon: 72.9, elev: 14 },
    destination: { name: "Mangaluru", lat: 12.9, lon: 74.8, elev: 22 },
    routes: [{
      id: "rail",
      name: "Konkan Rail",
      color: "#0066ff",
      difficulty: "Easy",
      stats: { distanceKm: 738, durationHr: 16 },
      waypoints: [
        { lat: 19.0, lon: 72.9, elev: 14 },
        { lat: 12.9, lon: 74.8, elev: 22 },
      ],
    }],
    landmarks: [],
    topography: { basemap: "imagery", zoom: 7 },
  },
};

describe("clampIndex", () => {
  it("clamps below zero", () => { expect(clampIndex(-3, 5)).toBe(0); });
  it("clamps above last", () => { expect(clampIndex(7, 5)).toBe(4); });
  it("passes valid values through", () => { expect(clampIndex(2, 5)).toBe(2); });
  it("handles empty list", () => { expect(clampIndex(0, 0)).toBe(0); });
});

describe("ReelFeed", () => {
  it("renders the initial reel and shows count", () => {
    render(<ReelFeed locationId="tirupati-tirumala" locations={FIXTURE} onSwitchToAtlas={() => {}} />);
    expect(screen.getByText("Tirupati → Tirumala")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("ArrowDown advances to the next reel", () => {
    render(<ReelFeed locationId="tirupati-tirumala" locations={FIXTURE} onSwitchToAtlas={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(screen.getByText("Konkan Railway")).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("ArrowUp at first reel stays at first reel", () => {
    render(<ReelFeed locationId="tirupati-tirumala" locations={FIXTURE} onSwitchToAtlas={() => {}} />);
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("Escape triggers onSwitchToAtlas", () => {
    const onSwitch = vi.fn();
    render(<ReelFeed locationId="tirupati-tirumala" locations={FIXTURE} onSwitchToAtlas={onSwitch} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it("renders the Atlas back button", () => {
    render(<ReelFeed locationId="tirupati-tirumala" locations={FIXTURE} onSwitchToAtlas={() => {}} />);
    expect(screen.getByRole("button", { name: /back to atlas/i })).toBeInTheDocument();
  });

  it("shows empty state when no locations", () => {
    render(<ReelFeed locationId="x" locations={{}} onSwitchToAtlas={() => {}} />);
    expect(screen.getByText(/no journeys available yet/i)).toBeInTheDocument();
  });
});
