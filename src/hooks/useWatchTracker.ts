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
  const playerDurationKnownRef = useRef(false);
  const lastReportedTimeRef = useRef<number | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const currentStatusRef = useRef(currentStatus);
  const lastSyncedAtRef = useRef(0);
  const lastSyncedPercentRef = useRef(0);
  const lastSyncedSecondsRef = useRef(0);
  const lastForcedStatusRef = useRef<WatchStatus | null>(null);
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
    playerDurationKnownRef.current = false;
    lastReportedTimeRef.current = null;
    lastSyncedAtRef.current = 0;
    lastSyncedPercentRef.current = 0;
    lastSyncedSecondsRef.current = 0;
    lastForcedStatusRef.current = null;
    playbackStartedRef.current = false;
    setPlaybackStarted(false);
  }, [kinopoiskId]);

  // Длительность из карточки приходит позже, чем стартует плеер: обновляем её, не сбрасывая прогресс.
  useEffect(() => {
    if (!playerDurationKnownRef.current) {
      durationSecondsRef.current = Math.max((filmLengthMinutes ?? 90) * 60, 60);
    }
  }, [filmLengthMinutes, kinopoiskId]);

  const getProgressPercent = useCallback(() => {
    const duration = Math.max(durationSecondsRef.current, 1);
    return Math.min(100, Math.round((watchSecondsRef.current / duration) * 100));
  }, []);

  const syncProgress = useCallback(
    async (forceStatus?: WatchStatus, options?: { keepalive?: boolean }) => {
      if (!kinopoiskId || !playbackStartedRef.current) {
        return;
      }

      const watchSeconds = Math.floor(watchSecondsRef.current);
      const progressPercent = getProgressPercent();

      if (!shouldSyncWatchProgress(watchSeconds, progressPercent, forceStatus)) {
        return;
      }

      if (
        options?.keepalive &&
        forceStatus === undefined &&
        watchSeconds <= lastSyncedSecondsRef.current
      ) {
        return;
      }

      const resolvedForceStatus = resolveWatchForceStatus(
        watchSeconds,
        progressPercent,
        forceStatus,
        currentStatusRef.current
      );

      lastSyncedAtRef.current = Date.now();
      lastSyncedPercentRef.current = progressPercent;
      lastSyncedSecondsRef.current = watchSeconds;

      const item = await siteApi.updateWatchProgress(
        {
          kinopoiskId,
          watchSeconds,
          progressPercent,
          forceStatus: resolvedForceStatus
        },
        { keepalive: options?.keepalive }
      );

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
      if (!enabled || !kinopoiskId || currentTime < 0) {
        return;
      }

      const previousTime = lastReportedTimeRef.current;
      lastReportedTimeRef.current = currentTime;

      // Не все плееры шлют «play»: идущее вперёд время тоже означает, что фильм смотрят.
      if (!playbackStartedRef.current) {
        if (ended || (previousTime !== null && currentTime > previousTime)) {
          playbackStartedRef.current = true;
          setPlaybackStarted(true);
        } else {
          return;
        }
      }

      watchSecondsRef.current = Math.max(watchSecondsRef.current, currentTime);

      if (duration && duration > 0) {
        durationSecondsRef.current = duration;
        playerDurationKnownRef.current = true;
      }

      const watchSeconds = Math.floor(watchSecondsRef.current);
      const progressPercent = getProgressPercent();
      const nextStatus =
        ended || progressPercent >= WATCHED_THRESHOLD
          ? "watched"
          : watchSeconds >= MIN_WATCH_SECONDS && currentStatusRef.current !== "watched"
            ? "watching"
            : undefined;
      const statusChanged =
        nextStatus !== undefined &&
        nextStatus !== currentStatusRef.current &&
        nextStatus !== lastForcedStatusRef.current;

      if (statusChanged) {
        lastForcedStatusRef.current = nextStatus;
      }

      maybeSyncProgress(statusChanged ? nextStatus : undefined);
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

    const flush = () => {
      void syncProgress(undefined, { keepalive: true }).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush();
    };
  }, [enabled, kinopoiskId, playbackStarted, syncProgress]);

  return { markPlaybackStarted, reportPosition, playbackStarted };
}
