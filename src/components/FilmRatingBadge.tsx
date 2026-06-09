type FilmRatingBadgeProps = {
  rating?: string;
};

export function FilmRatingBadge({ rating }: FilmRatingBadgeProps) {
  const normalized = rating?.trim();

  if (!normalized) {
    return null;
  }

  return (
    <span className="film-rating-badge" aria-label={`Рейтинг Кинопоиска ${normalized}`}>
      {normalized}
    </span>
  );
}
