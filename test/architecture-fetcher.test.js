import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildCommonsImageUrl,
  parseCommonsResponse,
  fetchArchitecture,
  fetchArchitectureForLandmarks,
} from "../src/services/architectureFetcher.js";

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) window.localStorage.clear();
});

describe("buildCommonsImageUrl", () => {
  it("encodes the title in the query string", () => {
    const url = buildCommonsImageUrl("Ranganathaswamy Temple, Srirangam");
    expect(url).toContain("commons.wikimedia.org");
    expect(url).toContain("titles=Ranganathaswamy");
    expect(url).toContain("prop=pageimages%7Cimageinfo");
  });
});

describe("parseCommonsResponse", () => {
  it("returns null when there are no pages", () => {
    expect(parseCommonsResponse({})).toBe(null);
    expect(parseCommonsResponse({ query: {} })).toBe(null);
  });

  it("extracts url + license + artist when present", () => {
    const out = parseCommonsResponse({
      query: {
        pages: {
          "12345": {
            original: { source: "https://upload.wikimedia.org/big.jpg" },
            thumbnail: { source: "https://upload.wikimedia.org/thumb.jpg" },
            imageinfo: [{
              extmetadata: {
                LicenseShortName: { value: "CC0" },
                Artist: { value: "<a href='#'>Photographer Name</a>" },
                ImageDescription: { value: "<p>A view of the temple</p>" },
              },
            }],
          },
        },
      },
    });
    expect(out.url).toBe("https://upload.wikimedia.org/big.jpg");
    expect(out.thumbnailUrl).toBe("https://upload.wikimedia.org/thumb.jpg");
    expect(out.license).toBe("CC0");
    expect(out.artist).toBe("Photographer Name"); // HTML stripped
  });

  it("falls back to thumbnail when original is missing", () => {
    const out = parseCommonsResponse({
      query: { pages: { "1": { thumbnail: { source: "https://t.jpg" } } } },
    });
    expect(out.url).toBe("https://t.jpg");
  });
});

describe("fetchArchitecture", () => {
  function mockFetch(json, ok = true) {
    return vi.fn().mockResolvedValue({
      ok, status: ok ? 200 : 500,
      json: async () => json,
    });
  }

  it("returns null on empty title", async () => {
    expect(await fetchArchitecture("")).toBe(null);
    expect(await fetchArchitecture(null)).toBe(null);
  });

  it("returns parsed image on hit and caches it", async () => {
    const json = { query: { pages: { "1": { original: { source: "https://u/a.jpg" }, imageinfo: [{ extmetadata: { LicenseShortName: { value: "CC0" } } }] } } } };
    const fetchImpl = mockFetch(json);
    const out1 = await fetchArchitecture("Ranganathaswamy", { fetchImpl });
    expect(out1.url).toBe("https://u/a.jpg");
    expect(out1.cacheHit).toBe(false);
    // Second call hits cache, no fetch.
    const out2 = await fetchArchitecture("Ranganathaswamy", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out2.cacheHit).toBe(true);
  });

  it("returns null on network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("oops"));
    expect(await fetchArchitecture("X", { fetchImpl })).toBe(null);
  });

  it("returns null on non-200", async () => {
    const fetchImpl = mockFetch({}, false);
    expect(await fetchArchitecture("X", { fetchImpl })).toBe(null);
  });
});

describe("fetchArchitectureForLandmarks", () => {
  it("fetches in parallel; returns Map<id, overlay|null>", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ query: { pages: { "1": { original: { source: "https://u/x.jpg" }, imageinfo: [{ extmetadata: { LicenseShortName: { value: "CC0" } } }] } } } }),
    });
    const out = await fetchArchitectureForLandmarks(
      [
        { id: "a", subTemplate: { wikimediaTitle: "Title A" } },
        { id: "b", subTemplate: { wikimediaTitle: "Title B" } },
        { id: "c" }, // no wikimediaTitle
      ],
      { fetchImpl },
    );
    expect(out.size).toBe(3);
    expect(out.get("a")).not.toBe(null);
    expect(out.get("b")).not.toBe(null);
    expect(out.get("c")).toBe(null);
  });
});
