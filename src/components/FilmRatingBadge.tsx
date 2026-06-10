import { useInView } from "../hooks/useInView";

type FilmRatingBadgeProps = {
  rating?: string;
};

export function FilmRatingBadge({ rating }: FilmRatingBadgeProps) {
  const { ref, isInView } = useInView<HTMLSpanElement>();
  const normalized = rating?.trim();

  if (!normalized) {
    return null;
  }

  return (
    <span
      ref={ref}
      className={`film-rating-badge${isInView ? " film-rating-badge--visible" : ""}`}
      aria-label={`Рейтинг Кинопоиска ${normalized}`}
    >
      {normalized}
    </span>
  );
}
