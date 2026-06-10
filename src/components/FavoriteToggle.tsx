import { useState } from "react";

import { siteApi } from "../lib/siteApi";

type FavoriteToggleProps = {
  kinopoiskId: number;
  isFavorite: boolean;
  isAuthenticated: boolean;
  onChange?: (isFavorite: boolean) => void;
};

export function FavoriteToggle({
  kinopoiskId,
  isFavorite,
  isAuthenticated,
  onChange
}: FavoriteToggleProps) {
  const [isSaving, setIsSaving] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  async function handleToggle() {
    setIsSaving(true);

    try {
      const nextFavorite = !isFavorite;
      await siteApi.toggleFilmList(kinopoiskId, "favorite", nextFavorite);
      onChange?.(nextFavorite);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <button
      type="button"
      className={`favorite-toggle${isFavorite ? " favorite-toggle--active" : ""}`}
      aria-label={isFavorite ? "Убрать из любимого" : "Добавить в любимое"}
      aria-pressed={isFavorite}
      disabled={isSaving}
      onClick={() => void handleToggle()}
    >
      <span aria-hidden="true">♥</span>
    </button>
  );
}
