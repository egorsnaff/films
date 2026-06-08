import { useState } from "react";

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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return null;
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
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="watch-list-controls">
      {currentStatus === "watching" || currentStatus === "watched" ? (
        <p className="watch-list-controls__auto">
          {currentStatus === "watched" ? "Просмотрено" : "Смотрите сейчас"}
          {typeof progressPercent === "number" && progressPercent > 0 ? (
            <span className="watch-list-controls__progress">{progressPercent}%</span>
          ) : null}
        </p>
      ) : null}
      <div className="watch-list-controls__buttons">
        {manualStatuses.map((status) => (
          <button
            key={status}
            type="button"
            className={currentStatus === status ? "is-active" : undefined}
            disabled={isSaving}
            onClick={() => void handleSelect(status)}
          >
            {watchStatusLabels[status]}
          </button>
        ))}
      </div>
      {error ? <p className="error-message">{error}</p> : null}
    </div>
  );
}
