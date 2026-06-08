import type { KinopoiskFilm } from "../lib/kinopoisk";

type FilmGridProps = {
  films: KinopoiskFilm[];
  onSelect: (film: KinopoiskFilm) => void;
};

export function FilmGrid({ films, onSelect }: FilmGridProps) {
  return (
    <div className="film-grid">
      {films.map((film) => (
        <button
          key={film.kinopoiskId}
          type="button"
          className="film-card"
          onClick={() => onSelect(film)}
        >
          <span className="film-card__poster">
            {film.posterUrl ? (
              <img src={film.posterUrl} alt={`Постер ${film.title}`} loading="lazy" />
            ) : (
              <span className="poster-placeholder">Нет постера</span>
            )}
          </span>
          <span className="film-card__body">
            <strong>{film.title}</strong>
            <small>
              {[film.originalTitle, film.year, film.rating && `КП ${film.rating}`]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}
