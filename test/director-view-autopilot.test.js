import { describe, it, expect } from "vitest";
import { autopilotDefaults } from "../src/components/director/DirectorView.jsx";

const sampleRoutes = [
  { id: "yadagiri-gutta", title: "Yadagiri Gutta", cfg: { id: "yadagiri-gutta", title: "Yadagiri Gutta" } },
  { id: "tirumala", title: "Tirupati → Tirumala", cfg: { id: "tirumala", title: "Tirupati → Tirumala" } },
];

describe("autopilotDefaults", () => {
  it("picks devotional + relief + first route + an AI-suggested note", () => {
    const d = autopilotDefaults({ routeChoices: sampleRoutes, device: { language: "te-IN" } });
    expect(d.tone).toBe("devotional");
    expect(d.basemap).toBe("relief");
    expect(d.routeId).toBe("yadagiri-gutta");
    expect(d.language).toBe("te");
    expect(d.personalNote).toContain("Yadagiri Gutta");
  });

  it("falls back to English when device locale is unsupported", () => {
    const d = autopilotDefaults({ routeChoices: sampleRoutes, device: { language: "fr-FR" } });
    expect(d.language).toBe("en");
  });

  it("strips region code from BCP-47 locales (hi-IN → hi)", () => {
    const d = autopilotDefaults({ routeChoices: sampleRoutes, device: { language: "hi-IN" } });
    expect(d.language).toBe("hi");
  });

  it("handles empty routeChoices safely", () => {
    const d = autopilotDefaults({ routeChoices: [], device: { language: "en" } });
    expect(d.routeId).toBe("");
    expect(d.personalNote).toBe("");
    expect(d.tone).toBe("devotional");
  });

  it("works with no arguments at all", () => {
    const d = autopilotDefaults();
    expect(d.tone).toBe("devotional");
    expect(d.basemap).toBe("relief");
    expect(d.language).toBe("en");
  });
});
