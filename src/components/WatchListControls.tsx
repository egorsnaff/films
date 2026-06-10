import { useEffect, useRef, useState } from "react";

import { siteApi, watchStatusLabels, type WatchStatus } from "../lib/siteApi";

type WatchListControlsProps = {
  kinopoiskId: number;
  currentStatus?: WatchStatus;
  progressPercent?: number;
  isAuthenticated: boolean;
  onStatusChange?: (status: WatchStatus | null) => void;
};

const manualStatuses: WatchStatus[] = ["plan", "waiting"];

export function WatchListControls({
  kinopoiskId,
  currentStatus,
  progressPercent,
  isAuthenticated,
  onStatusChange
}: WatchListControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPulse, setSavedPulse] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pulseTimerRef = useRef<number | null>(null);

  function flashSaved() {
    setSavedPulse(true);
    if (pulseTimerRef.current) {
      window.clearTimeout(pulseTimerRef.current);
    }
    pulseTimerRef.current = window.setTimeout(() => {
      setSavedPulse(false);
      pulseTimerRef.current = null;
    }, 900);
  }

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) {
        window.clearTimeout(pulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, []);

  if (!isAuthenticated) {
    return null;
  }

  async function handleMarkWatched() {
    setIsSaving(true);
    setError(null);

    try {
      const item = await siteApi.updateWatchProgress({
        kinopoiskId,
        watchSeconds: Math.max(progressPercent ?? 0, 100),
        progressPercent: 100,
        forceStatus: "watched"
      });
      if (item) {
        onStatusChange?.(item.status);
        flashSaved();
      }
      setIsOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSelect(status: WatchStatus) {
    setIsSaving(true);
    setError(null);

    try {
      if (currentStatus === status) {
        await siteApi.removeFilm(kinopoiskId);
        onStatusChange?.(null);
      } else {
        const item = await siteApi.setFilmStatus(kinopoiskId, status);
        onStatusChange?.(item.status);
        flashSaved();
      }
      setIsOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  }

  const statusLabel =
    currentStatus === "watched"
      ? "Просмотрено"
      : currentStatus === "watching"
        ? "Смотрите сейчас"
        : currentStatus
          ? watchStatusLabels[currentStatus]
          : null;

  return (
    <div className="watch-list-menu" ref={rootRef}>
      <button
        type="button"
        className={`watch-list-menu__trigger${savedPulse ? " watch-list-menu__trigger--saved" : ""}`}
        aria-label="Действия со списком"
        aria-expanded={isOpen}
        disabled={isSaving}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {isOpen ? (
        <div className="watch-list-menu__dropdown" role="menu">
          {statusLabel ? (
            <p className="watch-list-menu__status" role="presentation">
              {statusLabel}
              {typeof progressPercent === "number" && progressPercent > 0 ? (
                <span className="watch-list-menu__progress">{progressPercent}%</span>
              ) : null}
            </p>
          ) : null}
          {currentStatus === "watching" ? (
            <button type="button" role="menuitem" disabled={isSaving} onClick={() => void handleMarkWatched()}>
              Отметить просмотренным
            </button>
          ) : null}
          {manualStatuses.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              className={currentStatus === status ? "is-active" : undefined}
              disabled={isSaving}
              onClick={() => void handleSelect(status)}
            >
              {watchStatusLabels[status]}
              {currentStatus === status ? <span className="watch-list-menu__check">✓</span> : null}
            </button>
          ))}
          {error ? <p className="watch-list-menu__error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
