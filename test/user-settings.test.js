import { describe, it, expect, beforeEach } from "vitest";
import {
  readUserSettings,
  writeUserSettings,
  clearUserSettings,
  getEffectiveWorkerUrl,
} from "../src/services/userSettings.js";

const KEY = "yatra.settings.byok.v1";

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
});

describe("readUserSettings", () => {
  it("returns {} when storage is empty", () => {
    expect(readUserSettings()).toEqual({});
  });

  it("returns {} when JSON is corrupt", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(readUserSettings()).toEqual({});
  });

  it("returns {} when value is not an object", () => {
    window.localStorage.setItem(KEY, '"a string"');
    expect(readUserSettings()).toEqual({});
  });

  it("returns only recognized string fields", () => {
    window.localStorage.setItem(KEY, JSON.stringify({
      anthropicKey: "sk-ant-x",
      googleTtsKey: "AIza-x",
      workerUrl: "https://w/",
      openRouterKey: "sk-or-x",
      openRouterModel: "openai/gpt-4o-mini",
      unknownField: 42,
      anthropicKey2: "leak",
    }));
    const s = readUserSettings();
    expect(s).toEqual({
      anthropicKey: "sk-ant-x",
      googleTtsKey: "AIza-x",
      workerUrl: "https://w/",
      openRouterKey: "sk-or-x",
      openRouterModel: "openai/gpt-4o-mini",
    });
  });

  it("drops empty-string and non-string fields", () => {
    window.localStorage.setItem(KEY, JSON.stringify({
      anthropicKey: "",
      googleTtsKey: null,
      workerUrl: 123,
    }));
    expect(readUserSettings()).toEqual({});
  });
});

describe("writeUserSettings", () => {
  it("persists a partial write", () => {
    writeUserSettings({ googleTtsKey: "AIza-1" });
    expect(readUserSettings()).toEqual({ googleTtsKey: "AIza-1" });
  });

  it("merges with existing settings", () => {
    writeUserSettings({ googleTtsKey: "AIza-1" });
    writeUserSettings({ anthropicKey: "sk-2" });
    expect(readUserSettings()).toEqual({
      googleTtsKey: "AIza-1",
      anthropicKey: "sk-2",
    });
  });

  it("empty string deletes the field (forget-this-key affordance)", () => {
    writeUserSettings({ googleTtsKey: "AIza-1", anthropicKey: "sk-2" });
    writeUserSettings({ googleTtsKey: "" });
    expect(readUserSettings()).toEqual({ anthropicKey: "sk-2" });
  });

  it("removes the localStorage entry entirely when all fields cleared", () => {
    writeUserSettings({ googleTtsKey: "AIza-1" });
    writeUserSettings({ googleTtsKey: "" });
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("ignores non-string field types silently", () => {
    writeUserSettings({ googleTtsKey: 42, anthropicKey: null });
    expect(readUserSettings()).toEqual({});
  });
});

describe("clearUserSettings", () => {
  it("removes the localStorage entry", () => {
    writeUserSettings({ googleTtsKey: "AIza-1" });
    clearUserSettings();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("is safe to call when nothing is stored", () => {
    expect(() => clearUserSettings()).not.toThrow();
  });
});

describe("getEffectiveWorkerUrl", () => {
  it("returns user override when present", () => {
    writeUserSettings({ workerUrl: "https://my-worker.example/" });
    expect(getEffectiveWorkerUrl("https://default/")).toBe("https://my-worker.example/");
  });

  it("returns env URL when no user override", () => {
    expect(getEffectiveWorkerUrl("https://default/")).toBe("https://default/");
  });

  it("returns empty string when neither is set", () => {
    expect(getEffectiveWorkerUrl()).toBe("");
    expect(getEffectiveWorkerUrl("")).toBe("");
  });

  it("trims whitespace from user override", () => {
    writeUserSettings({ workerUrl: "  https://w/  " });
    expect(getEffectiveWorkerUrl("https://default/")).toBe("https://w/");
  });
});
