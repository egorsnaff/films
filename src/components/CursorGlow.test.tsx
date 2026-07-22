import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CursorGlow } from "./CursorGlow";

describe("CursorGlow", () => {
  afterEach(() => {
    document.documentElement.classList.remove("cursor-active", "is-player-fullscreen");
    vi.restoreAllMocks();
  });

  it("does not render glow layers when disabled", () => {
    const { container } = render(<CursorGlow disabled />);
    expect(container.querySelector(".cursor-glow")).toBeNull();
    expect(document.documentElement.classList.contains("cursor-active")).toBe(false);
  });

  it("hides the glow while the document is fullscreen", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("hover: hover"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });

    render(<CursorGlow />);

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement
    });

    document.dispatchEvent(new Event("fullscreenchange"));

    expect(document.documentElement.classList.contains("is-player-fullscreen")).toBe(true);
    expect(document.documentElement.classList.contains("cursor-active")).toBe(false);

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null
    });
  });
});
