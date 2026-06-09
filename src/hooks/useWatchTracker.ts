import { useCallback, useEffect, useRef, useState } from "react";

import { siteApi, type WatchStatus } from "../lib/siteApi";

const TICK_MS = 30_000;
const PLAYER_SYNC_MS = 12_000;
const WATCHED_THRESHOLD = 90;

type UseWatchTrackerOptions = {
  enabled: boolean;
  kinopoiskId?: number;
  filmLengthMinutes?: number;
  currentStatus?: WatchStatus | null;
  onStatusChange?: (status: WatchStatus) => void;
};

type ReportPositionInput = {
  currentTime: number;
  duration?: number;
  ended?: boolean;
};

export function useWatchTracker({
  enabled,
  kinopoiskId,
  filmLengthMinutes,
  currentStatus,
  onStatusChange
}: UseWatchTrackerOptions) {
  const watchSecondsRef = useRef(0);
  const durationSecondsRef = useRef(Math.max((filmLengthMinutes ?? 90) * 60, 60));
  const onStatusChangeRef = useRef(onStatusChange);
  const lastSyncedAtRef = useRef(0);
  const lastSyncedPercentRef = useRef(0);
  const hasPlayerSignalRef = useRef(false);
  const [playbackStarted, setPlaybackStarted] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    watchSecondsRef.current = 0;
    durationSecondsRef.current = Math.max((filmLengthMinutes ?? 90) * 60, 60);
    lastSyncedAtRef.current = 0;
    lastSyncedPercentRef.current = 0;
    hasPlayerSignalRef.current = false;
    setPlaybackStarted(false);
  }, [filmLengthMinutes, kinopoiskId]);

  const getProgressPercent = useCallback(() => {
    const duration = Math.max(durationSecondsRef.current, 1);
    return Math.min(100, Math.round((watchSecondsRef.current / duration) * 100));
  }, []);

  const syncProgress = useCallback(
    async (forceStatus?: WatchStatus) => {
      if (!kinopoiskId) {
        return;
      }

      const progressPercent = getProgressPercent();
      const item = await siteApi.updateWatchProgress({
        kinopoiskId,
        watchSeconds: Math.floor(watchSecondsRef.current),
        progressPercent,
        forceStatus
      });
      lastSyncedAtRef.current = Date.now();
      lastSyncedPercentRef.current = progressPercent;
      onStatusChangeRef.current?.(item.status);
    },
    [getProgressPercent, kinopoiskId]
  );

  const maybeSyncProgress = useCallback(
    (forceStatus?: WatchStatus) => {
      const progressPercent = getProgressPercent();
      const now = Date.now();
      const crossedThreshold =
        lastSyncedPercentRef.current < WATCHED_THRESHOLD && progressPercent >= WATCHED_THRESHOLD;
      const intervalElapsed = now - lastSyncedAtRef.current >= PLAYER_SYNC_MS;
      const shouldSync =
        forceStatus !== undefined || crossedThreshold || intervalElapsed || progressPercent >= 100;

      if (!shouldSync) {
        return;
      }

      void syncProgress(forceStatus);
    },
    [getProgressPercent, syncProgress]
  );

  const reportPosition = useCallback(
    ({ currentTime, duration, ended }: ReportPositionInput) => {
      if (!enabled || !kinopoiskId || currentTime < 0) {
        return;
      }

      hasPlayerSignalRef.current = true;
      watchSecondsRef.current = Math.max(watchSecondsRef.current, currentTime);

      if (duration && duration > 0) {
        durationSecondsRef.current = duration;
      }

      if (!playbackStarted) {
        setPlaybackStarted(true);
      }

      const progressPercent = getProgressPercent();
      const nextStatus =
        ended || progressPercent >= WATCHED_THRESHOLD
          ? "watched"
          : currentStatus !== "watched"
            ? "watching"
            : undefined;

      maybeSyncProgress(nextStatus);
    },
    [currentStatus, enabled, getProgressPercent, kinopoiskId, maybeSyncProgress, playbackStarted]
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
    if (!enabled || !kinopoiskId || !playbackStarted || hasPlayerSignalRef.current) {
      return;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      watchSecondsRef.current += TICK_MS / 1000;
      const progressPercent = getProgressPercent();
      maybeSyncProgress(progressPercent >= WATCHED_THRESHOLD ? "watched" : undefined);
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [enabled, getProgressPercent, kinopoiskId, maybeSyncProgress, playbackStarted]);

  useEffect(() => {
    if (!enabled || !kinopoiskId || !playbackStarted) {
      return;
    }

    return () => {
      void syncProgress();
    };
  }, [enabled, kinopoiskId, playbackStarted, syncProgress]);

  return { markPlaybackStarted, reportPosition };
}
