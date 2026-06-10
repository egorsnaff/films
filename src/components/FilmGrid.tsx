import type { CSSProperties } from "react";

import type { KinopoiskFilm } from "../lib/kinopoisk";

import { FilmRatingBadge } from "./FilmRatingBadge";

type FilmGridProps = {
  films: KinopoiskFilm[];
  animate?: boolean;
  onSelect: (film: KinopoiskFilm) => void;
};

export function FilmGrid({ films, animate = true, onSelect }: FilmGridProps) {
  return (
    <div className={`film-grid${animate ? " film-grid--revealed" : ""}`}>
      {films.map((film, index) => (
        <button
          key={film.kinopoiskId}
          type="button"
          className="film-card film-card--interactive"
          style={animate ? ({ "--stagger": index } as CSSProperties) : undefined}
          onClick={() => onSelect(film)}
        >
          <span className="film-card__poster">
            {film.posterUrl ? (
              <img src={film.posterUrl} alt={`Постер ${film.title}`} loading="lazy" />
            ) : (
              <span className="poster-placeholder">Нет постера</span>
            )}
            <FilmRatingBadge rating={film.rating} />
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
