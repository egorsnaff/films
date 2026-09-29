import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PresenceActivity } from "../lib/presence";
import { siteApi } from "../lib/siteApi";

import {
  PRESENCE_CHANGE_DEBOUNCE_MS,
  PRESENCE_VISIBLE_INTERVAL_MS,
  usePresence
} from "./usePresence";

describe("usePresence", () => {
  const updatePresence = vi.spyOn(siteApi, "updatePresence");
  const others = [{ id: 3, username: "kseniya", online: true, activity: { kind: "catalog" as const } }];

  beforeEach(() => {
    vi.useFakeTimers();
    updatePresence.mockReset();
    updatePresence.mockResolvedValue(others);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the activity right away, then polls on the visible interval", async () => {
    const { result } = renderHook(() =>
      usePresence({ enabled: true, activity: { kind: "catalog" } })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(updatePresence).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual(others);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_VISIBLE_INTERVAL_MS);
    });
    expect(updatePresence).toHaveBeenCalledTimes(2);
  });

  it("debounces rapid activity changes", async () => {
    const { rerender } = renderHook(
      ({ activity }: { activity: PresenceActivity }) => usePresence({ enabled: true, activity }),
      { initialProps: { activity: { kind: "catalog" } as PresenceActivity } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender({ activity: { kind: "searching" } });
    rerender({ activity: { kind: "profile" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_CHANGE_DEBOUNCE_MS);
    });

    expect(updatePresence).toHaveBeenCalledTimes(2);
    expect(updatePresence).toHaveBeenLastCalledWith(
      expect.objectContaining({ activity: { kind: "profile" } })
    );
  });

  it("does nothing when disabled and leaves when turned off", async () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePresence({ enabled, activity: { kind: "catalog" } }),
      { initialProps: { enabled: false } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_VISIBLE_INTERVAL_MS * 2);
    });
    expect(updatePresence).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender({ enabled: false });

    expect(updatePresence).toHaveBeenLastCalledWith(
      expect.objectContaining({ leaving: true }),
      { keepalive: true }
    );

    updatePresence.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_VISIBLE_INTERVAL_MS * 2);
    });
    expect(updatePresence).not.toHaveBeenCalled();
  });
});
