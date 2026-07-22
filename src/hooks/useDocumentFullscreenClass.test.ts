import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useDocumentFullscreenClass } from "./useDocumentFullscreenClass";

describe("useDocumentFullscreenClass", () => {
  afterEach(() => {
    document.documentElement.classList.remove("is-player-fullscreen");
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null
    });
  });

  it("toggles the class when the document enters and leaves fullscreen", () => {
    renderHook(() => useDocumentFullscreenClass("is-player-fullscreen"));

    expect(document.documentElement.classList.contains("is-player-fullscreen")).toBe(false);

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.documentElement
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(document.documentElement.classList.contains("is-player-fullscreen")).toBe(true);

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => null
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(document.documentElement.classList.contains("is-player-fullscreen")).toBe(false);
  });

  it("keeps working even when CursorGlow would be disabled on the watch page", () => {
    // Fullscreen class must not depend on the glow effect being active.
    const { unmount } = renderHook(() => useDocumentFullscreenClass("is-player-fullscreen"));

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => document.createElement("iframe")
    });
    document.dispatchEvent(new Event("fullscreenchange"));

    expect(document.documentElement.classList.contains("is-player-fullscreen")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("is-player-fullscreen")).toBe(false);
  });
});
