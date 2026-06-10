import { useCallback, useEffect, useRef, useState } from "react";

import { MIN_WATCH_SECONDS } from "../lib/playerProgress";
import { siteApi, type WatchStatus } from "../lib/siteApi";

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

function shouldSyncWatchProgress(
  watchSeconds: number,
  progressPercent: number,
  forceStatus?: WatchStatus
): boolean {
  if (forceStatus === "watched" || progressPercent >= WATCHED_THRESHOLD) {
    return true;
  }

  if (forceStatus && forceStatus !== "watching") {
    return true;
  }

  return watchSeconds >= MIN_WATCH_SECONDS;
}

function resolveWatchForceStatus(
  watchSeconds: number,
  progressPercent: number,
  requested?: WatchStatus,
  currentStatus?: WatchStatus | null
): WatchStatus | undefined {
  if (progressPercent >= WATCHED_THRESHOLD || requested === "watched") {
    return "watched";
  }

  if (requested && requested !== "watching") {
    return requested;
  }

  if (watchSeconds < MIN_WATCH_SECONDS) {
    return undefined;
  }

  if (currentStatus === "watched") {
    return undefined;
  }

  return requested ?? "watching";
}

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
  const currentStatusRef = useRef(currentStatus);
  const lastSyncedAtRef = useRef(0);
  const lastSyncedPercentRef = useRef(0);
  const playbackStartedRef = useRef(false);
  const [playbackStarted, setPlaybackStarted] = useState(false);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    currentStatusRef.current = currentStatus;
  }, [currentStatus]);

  useEffect(() => {
    watchSecondsRef.current = 0;
    durationSecondsRef.current = Math.max((filmLengthMinutes ?? 90) * 60, 60);
    lastSyncedAtRef.current = 0;
    lastSyncedPercentRef.current = 0;
    playbackStartedRef.current = false;
    setPlaybackStarted(false);
  }, [filmLengthMinutes, kinopoiskId]);

  const getProgressPercent = useCallback(() => {
    const duration = Math.max(durationSecondsRef.current, 1);
    return Math.min(100, Math.round((watchSecondsRef.current / duration) * 100));
  }, []);

  const syncProgress = useCallback(
    async (forceStatus?: WatchStatus) => {
      if (!kinopoiskId || !playbackStartedRef.current) {
        return;
      }

      const watchSeconds = Math.floor(watchSecondsRef.current);
      const progressPercent = getProgressPercent();

      if (!shouldSyncWatchProgress(watchSeconds, progressPercent, forceStatus)) {
        return;
      }

      const resolvedForceStatus = resolveWatchForceStatus(
        watchSeconds,
        progressPercent,
        forceStatus,
        currentStatusRef.current
      );

      const item = await siteApi.updateWatchProgress({
        kinopoiskId,
        watchSeconds,
        progressPercent,
        forceStatus: resolvedForceStatus
      });
      lastSyncedAtRef.current = Date.now();
      lastSyncedPercentRef.current = progressPercent;

      if (item) {
        const nextStatus =
          item.lists.find((status) => status === "watched") ??
          item.lists.find((status) => status === "watching");

        if (nextStatus) {
          onStatusChangeRef.current?.(nextStatus);
        }
      }
    },
    [getProgressPercent, kinopoiskId]
  );

  const maybeSyncProgress = useCallback(
    (forceStatus?: WatchStatus) => {
      if (!playbackStartedRef.current) {
        return;
      }

      const watchSeconds = Math.floor(watchSecondsRef.current);
      const progressPercent = getProgressPercent();
      const now = Date.now();
      const crossedThreshold =
        lastSyncedPercentRef.current < WATCHED_THRESHOLD && progressPercent >= WATCHED_THRESHOLD;
      const intervalElapsed = now - lastSyncedAtRef.current >= PLAYER_SYNC_MS;
      const shouldSync =
        shouldSyncWatchProgress(watchSeconds, progressPercent, forceStatus) &&
        (forceStatus !== undefined || crossedThreshold || intervalElapsed || progressPercent >= 100);

      if (!shouldSync) {
        return;
      }

      void syncProgress(forceStatus);
    },
    [getProgressPercent, syncProgress]
  );

  const reportPosition = useCallback(
    ({ currentTime, duration, ended }: ReportPositionInput) => {
      if (!enabled || !kinopoiskId || !playbackStartedRef.current || currentTime < 0) {
        return;
      }

      watchSecondsRef.current = Math.max(watchSecondsRef.current, currentTime);

      if (duration && duration > 0) {
        durationSecondsRef.current = duration;
      }

      const watchSeconds = Math.floor(watchSecondsRef.current);
      const progressPercent = getProgressPercent();
      const nextStatus =
        ended || progressPercent >= WATCHED_THRESHOLD
          ? "watched"
          : watchSeconds >= MIN_WATCH_SECONDS && currentStatusRef.current !== "watched"
            ? "watching"
            : undefined;

      maybeSyncProgress(nextStatus);
    },
    [enabled, getProgressPercent, kinopoiskId, maybeSyncProgress]
  );

  const markPlaybackStarted = useCallback(() => {
    if (!enabled || !kinopoiskId || playbackStartedRef.current) {
      return;
    }

    playbackStartedRef.current = true;
    setPlaybackStarted(true);
  }, [enabled, kinopoiskId]);

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
