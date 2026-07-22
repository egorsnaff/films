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

  it("does not activate the glow while the document is fullscreen", () => {
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

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement
    });

    render(<CursorGlow />);
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 120, clientY: 80 }));

    expect(document.documentElement.classList.contains("cursor-active")).toBe(false);

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null
    });
  });
});
