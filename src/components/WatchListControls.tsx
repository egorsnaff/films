import { useState } from "react";

import { siteApi, watchStatusLabels, type WatchStatus } from "../lib/siteApi";

type WatchListControlsProps = {
  kinopoiskId: number;
  activeLists: WatchStatus[];
  isAuthenticated: boolean;
  onListsChange?: (lists: WatchStatus[]) => void;
};

const quickStatuses: Array<{ status: WatchStatus; icon: string }> = [
  { status: "plan", icon: "+" },
  { status: "watched", icon: "✓" }
];

export function WatchListControls({
  kinopoiskId,
  activeLists,
  isAuthenticated,
  onListsChange
}: WatchListControlsProps) {
  const [savingStatus, setSavingStatus] = useState<WatchStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthenticated) {
    return null;
  }

  async function handleToggle(status: WatchStatus) {
    const enabled = !activeLists.includes(status);
    setSavingStatus(status);
    setError(null);

    try {
      const item = await siteApi.toggleFilmList(kinopoiskId, status, enabled);
      const nextLists = item?.lists ?? activeLists.filter((entry) => entry !== status);
      onListsChange?.(nextLists);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить");
    } finally {
      setSavingStatus(null);
    }
  }

  return (
    <div className="watch-list-actions" role="group" aria-label="Списки">
      {quickStatuses.map(({ status, icon }) => {
        const isActive = activeLists.includes(status);
        return (
          <button
            key={status}
            type="button"
            className={`watch-list-actions__button${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            disabled={savingStatus !== null}
            onClick={() => void handleToggle(status)}
          >
            <span className="watch-list-actions__icon" aria-hidden="true">
              {isActive ? "✓" : icon}
            </span>
            {watchStatusLabels[status]}
          </button>
        );
      })}
      {error ? <p className="watch-list-actions__error">{error}</p> : null}
    </div>
  );
}
