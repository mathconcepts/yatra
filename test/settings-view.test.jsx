import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SettingsView from "../src/components/settings/SettingsView.jsx";
import { writeUserSettings, readUserSettings } from "../src/services/userSettings.js";

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
});

describe("SettingsView", () => {
  it("renders all field labels (OpenRouter + Anthropic + TTS + Worker URL)", () => {
    render(<SettingsView onCancel={() => {}} />);
    expect(screen.getByText("OpenRouter API key")).toBeInTheDocument();
    expect(screen.getByText("OpenRouter model (optional)")).toBeInTheDocument();
    expect(screen.getByText("Anthropic API key (direct)")).toBeInTheDocument();
    expect(screen.getByText("Google Cloud TTS API key")).toBeInTheDocument();
    expect(screen.getByText("Custom Worker URL")).toBeInTheDocument();
  });

  it("pre-fills fields from existing localStorage settings", () => {
    writeUserSettings({ googleTtsKey: "AIza-existing" });
    render(<SettingsView onCancel={() => {}} />);
    const input = screen.getByPlaceholderText("AIza...");
    expect(input.value).toBe("AIza-existing");
  });

  it("Save writes the new value to localStorage", () => {
    render(<SettingsView onCancel={() => {}} />);
    const input = screen.getByPlaceholderText("AIza...");
    fireEvent.change(input, { target: { value: "AIza-new" } });
    // The Save button for the Google TTS field — find by role within its section.
    const section = input.closest("section");
    const saveBtn = Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Save");
    fireEvent.click(saveBtn);
    expect(readUserSettings().googleTtsKey).toBe("AIza-new");
  });

  it("Forget clears the field from localStorage", () => {
    writeUserSettings({ googleTtsKey: "AIza-saved" });
    render(<SettingsView onCancel={() => {}} />);
    const input = screen.getByPlaceholderText("AIza...");
    const section = input.closest("section");
    const forgetBtn = Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Forget");
    fireEvent.click(forgetBtn);
    expect(readUserSettings().googleTtsKey).toBeUndefined();
  });

  it("Forget all keys wipes the entire localStorage entry", () => {
    writeUserSettings({ googleTtsKey: "x", anthropicKey: "y", workerUrl: "https://z" });
    render(<SettingsView onCancel={() => {}} />);
    fireEvent.click(screen.getByText("Forget all keys"));
    expect(readUserSettings()).toEqual({});
  });

  it("Worker URL save opens type-to-confirm modal", () => {
    render(<SettingsView onCancel={() => {}} />);
    const input = screen.getByPlaceholderText("https://yatra-director.<your>.workers.dev");
    fireEvent.change(input, { target: { value: "https://my.worker" } });
    const section = input.closest("section");
    const saveBtn = Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Save");
    fireEvent.click(saveBtn);
    expect(screen.getByText("Confirm custom Worker URL")).toBeInTheDocument();
    expect(screen.getByText("my.worker")).toBeInTheDocument();
  });

  it("Worker URL save WITHOUT type-confirm does NOT persist", () => {
    render(<SettingsView onCancel={() => {}} />);
    const input = screen.getByPlaceholderText("https://yatra-director.<your>.workers.dev");
    fireEvent.change(input, { target: { value: "https://my.worker" } });
    const section = input.closest("section");
    fireEvent.click(Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Save"));
    // Modal is up. Type the wrong thing.
    const dialog = screen.getByRole("dialog");
    const confirmInput = dialog.querySelector('input[type="text"]');
    fireEvent.change(confirmInput, { target: { value: "wrong.host" } });
    const useBtn = screen.getByText("Use this Worker");
    expect(useBtn.disabled).toBe(true);
    expect(readUserSettings().workerUrl).toBeUndefined();
  });

  it("Worker URL save with correct type-confirm persists", () => {
    render(<SettingsView onCancel={() => {}} />);
    const input = screen.getByPlaceholderText("https://yatra-director.<your>.workers.dev");
    fireEvent.change(input, { target: { value: "https://my.worker" } });
    const section = input.closest("section");
    fireEvent.click(Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Save"));
    const dialog = screen.getByRole("dialog");
    const confirmInput = dialog.querySelector('input[type="text"]');
    fireEvent.change(confirmInput, { target: { value: "my.worker" } });
    fireEvent.click(screen.getByText("Use this Worker"));
    expect(readUserSettings().workerUrl).toBe("https://my.worker");
  });

  it("Show toggle reveals the masked input", () => {
    render(<SettingsView onCancel={() => {}} />);
    const input = screen.getByPlaceholderText("sk-ant-...");
    expect(input.type).toBe("password");
    const section = input.closest("section");
    fireEvent.click(Array.from(section.querySelectorAll("button")).find((b) => b.textContent === "Show"));
    expect(input.type).toBe("text");
  });
});
