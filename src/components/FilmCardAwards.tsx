import type { FilmAwardCardChip } from "../lib/kinopoisk";

type FilmCardAwardsProps = {
  chips: FilmAwardCardChip[];
  className?: string;
};

export function FilmCardAwards({ chips, className = "film-card__awards" }: FilmCardAwardsProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <span className={className} aria-label="Награды">
      {chips.map((chip) => (
        <span key={chip.name} className="film-card__award">
          {chip.imageUrl ? (
            <img className="film-card__award-icon" src={chip.imageUrl} alt="" loading="lazy" />
          ) : (
            <span className="film-card__award-icon film-card__award-icon--fallback" aria-hidden="true">
              ★
            </span>
          )}
          <span>
            {chip.name}
            {chip.wins > 0 ? ` ×${chip.wins}` : null}
          </span>
        </span>
      ))}
    </span>
  );
}
