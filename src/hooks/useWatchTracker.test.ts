import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { siteApi } from "../lib/siteApi";

import { useWatchTracker } from "./useWatchTracker";

describe("useWatchTracker", () => {
  const updateWatchProgress = vi.spyOn(siteApi, "updateWatchProgress");

  beforeEach(() => {
    updateWatchProgress.mockReset();
    updateWatchProgress.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks progress without an explicit play event", () => {
    const { result } = renderHook(() =>
      useWatchTracker({ enabled: true, kinopoiskId: 111543, filmLengthMinutes: 152 })
    );

    act(() => {
      result.current.reportPosition({ currentTime: 600 });
      result.current.reportPosition({ currentTime: 610, duration: 9120 });
    });

    expect(updateWatchProgress).toHaveBeenCalledWith(
      expect.objectContaining({ kinopoiskId: 111543, watchSeconds: 610, forceStatus: "watching" }),
      expect.anything()
    );
  });

  it("keeps progress when the film length arrives after playback started", () => {
    const { result, rerender } = renderHook(
      ({ filmLengthMinutes }: { filmLengthMinutes?: number }) =>
        useWatchTracker({ enabled: true, kinopoiskId: 111543, filmLengthMinutes }),
      { initialProps: { filmLengthMinutes: undefined as number | undefined } }
    );

    act(() => {
      result.current.markPlaybackStarted();
      result.current.reportPosition({ currentTime: 400 });
    });

    rerender({ filmLengthMinutes: 100 });
    updateWatchProgress.mockClear();

    act(() => {
      result.current.reportPosition({ currentTime: 5500 });
    });

    expect(updateWatchProgress).toHaveBeenCalledWith(
      expect.objectContaining({ watchSeconds: 5500, progressPercent: 92, forceStatus: "watched" }),
      expect.anything()
    );
  });

  it("does not send a request on every timeupdate once the film is in watching", () => {
    const { result } = renderHook(() =>
      useWatchTracker({ enabled: true, kinopoiskId: 111543, filmLengthMinutes: 152 })
    );

    act(() => {
      result.current.markPlaybackStarted();
      for (let second = 300; second < 310; second += 1) {
        result.current.reportPosition({ currentTime: second });
      }
    });

    expect(updateWatchProgress).toHaveBeenCalledTimes(1);
  });

  it("flushes progress with keepalive when the page is hidden", () => {
    const { result } = renderHook(() =>
      useWatchTracker({ enabled: true, kinopoiskId: 111543, filmLengthMinutes: 152 })
    );

    act(() => {
      result.current.markPlaybackStarted();
      result.current.reportPosition({ currentTime: 400 });
    });
    updateWatchProgress.mockClear();

    act(() => {
      result.current.reportPosition({ currentTime: 405 });
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(updateWatchProgress).toHaveBeenCalledWith(
      expect.objectContaining({ watchSeconds: 405 }),
      { keepalive: true }
    );
  });
});
