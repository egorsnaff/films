import { useEffect, useRef, useState } from "react";

import { siteApi, watchStatusLabels, type WatchStatus } from "../lib/siteApi";

type WatchListControlsProps = {
  kinopoiskId: number;
  activeLists: WatchStatus[];
  progressPercent?: number;
  isAuthenticated: boolean;
  onListsChange?: (lists: WatchStatus[]) => void;
};

const toggleableStatuses: WatchStatus[] = [
  "favorite",
  "plan",
  "waiting",
  "watching",
  "watched"
];

export function WatchListControls({
  kinopoiskId,
  activeLists,
  progressPercent,
  isAuthenticated,
  onListsChange
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

  async function handleToggle(status: WatchStatus) {
    const enabled = !activeLists.includes(status);
    setIsSaving(true);
    setError(null);

    try {
      const item = await siteApi.toggleFilmList(kinopoiskId, status, enabled);
      const nextLists = item?.lists ?? activeLists.filter((entry) => entry !== status);
      onListsChange?.(nextLists);
      flashSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="watch-list-menu" ref={rootRef}>
      <button
        type="button"
        className={`watch-list-menu__trigger${savedPulse ? " watch-list-menu__trigger--saved" : ""}`}
        aria-label="Списки и коллекции"
        aria-expanded={isOpen}
        disabled={isSaving}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {isOpen ? (
        <div className="watch-list-menu__dropdown" role="menu">
          {toggleableStatuses.map((status) => {
            const isActive = activeLists.includes(status);
            return (
              <button
                key={status}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isActive}
                className={isActive ? "is-active" : undefined}
                disabled={isSaving}
                onClick={() => void handleToggle(status)}
              >
                <span className="watch-list-menu__label">
                  {status === "favorite" ? (
                    <span className="watch-list-menu__favorite" aria-hidden="true">
                      ♥
                    </span>
                  ) : null}
                  {watchStatusLabels[status]}
                </span>
                {isActive ? <span className="watch-list-menu__check">✓</span> : null}
              </button>
            );
          })}
          {typeof progressPercent === "number" && progressPercent > 0 ? (
            <p className="watch-list-menu__progress-note">Прогресс просмотра: {progressPercent}%</p>
          ) : null}
          {error ? <p className="watch-list-menu__error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
