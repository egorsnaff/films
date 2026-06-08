import { useState } from "react";

import { siteApi, watchStatusLabels, type WatchStatus } from "../lib/siteApi";

type WatchListControlsProps = {
  kinopoiskId: number;
  currentStatus?: WatchStatus;
  isAuthenticated: boolean;
  onStatusChange?: (status: WatchStatus | null) => void;
};

const statuses: WatchStatus[] = ["watching", "plan", "waiting", "watched"];

export function WatchListControls({
  kinopoiskId,
  currentStatus,
  isAuthenticated,
  onStatusChange
}: WatchListControlsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return (
      <p className="hint watch-list-hint">
        Войдите в профиль, чтобы добавить фильм в «Смотрю сейчас» и другие списки.
      </p>
    );
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
      <p className="eyebrow">Мои списки</p>
      <div className="watch-list-controls__buttons">
        {statuses.map((status) => (
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
