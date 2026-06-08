import { useCallback, useEffect, useRef, useState } from "react";

import { siteApi, type WatchStatus } from "../lib/siteApi";

const TICK_MS = 30_000;
const WATCHED_THRESHOLD = 90;

type UseWatchTrackerOptions = {
  enabled: boolean;
  kinopoiskId?: number;
  filmLengthMinutes?: number;
  currentStatus?: WatchStatus | null;
  onStatusChange?: (status: WatchStatus) => void;
};

export function useWatchTracker({
  enabled,
  kinopoiskId,
  filmLengthMinutes,
  currentStatus,
  onStatusChange
}: UseWatchTrackerOptions) {
  const watchSecondsRef = useRef(0);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const durationSeconds = Math.max((filmLengthMinutes ?? 90) * 60, 60);

  useEffect(() => {
    watchSecondsRef.current = 0;
    setPlaybackStarted(false);
  }, [kinopoiskId]);

  const syncProgress = useCallback(
    async (forceStatus?: WatchStatus) => {
      if (!kinopoiskId) {
        return;
      }

      const progressPercent = Math.min(
        100,
        Math.round((watchSecondsRef.current / durationSeconds) * 100)
      );
      const item = await siteApi.updateWatchProgress({
        kinopoiskId,
        watchSeconds: watchSecondsRef.current,
        progressPercent,
        forceStatus
      });
      onStatusChange?.(item.status);
    },
    [durationSeconds, kinopoiskId, onStatusChange]
  );

  const markPlaybackStarted = useCallback(async () => {
    if (!enabled || !kinopoiskId || playbackStarted) {
      return;
    }

    setPlaybackStarted(true);

    if (currentStatus !== "watching" && currentStatus !== "watched") {
      await syncProgress("watching");
    }
  }, [currentStatus, enabled, kinopoiskId, playbackStarted, syncProgress]);

  useEffect(() => {
    if (!enabled || !kinopoiskId || !playbackStarted) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      watchSecondsRef.current += TICK_MS / 1000;
      const progressPercent = (watchSecondsRef.current / durationSeconds) * 100;

      void syncProgress(progressPercent >= WATCHED_THRESHOLD ? "watched" : undefined);
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [durationSeconds, enabled, kinopoiskId, playbackStarted, syncProgress]);

  useEffect(() => {
    if (!enabled || !kinopoiskId || !playbackStarted) {
      return;
    }

    return () => {
      void syncProgress();
    };
  }, [enabled, kinopoiskId, playbackStarted, syncProgress]);

  return { markPlaybackStarted };
}
