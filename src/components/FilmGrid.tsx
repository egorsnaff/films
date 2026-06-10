import type { CSSProperties } from "react";

import type { KinopoiskFilm } from "../lib/kinopoisk";

import { FilmRatingBadge } from "./FilmRatingBadge";
import { PosterImage } from "./PosterImage";

type FilmGridProps = {
  films: KinopoiskFilm[];
  animate?: boolean;
  loadingSkeletonCount?: number;
  onSelect: (film: KinopoiskFilm) => void;
};

export function FilmGrid({
  films,
  animate = true,
  loadingSkeletonCount = 0,
  onSelect
}: FilmGridProps) {
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
              <PosterImage src={film.posterUrl} alt={`Постер ${film.title}`} />
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
      {loadingSkeletonCount > 0
        ? Array.from({ length: loadingSkeletonCount }).map((_, index) => (
            <span
              key={`catalog-skeleton-${index}`}
              className="film-card film-card--skeleton"
              aria-hidden="true"
            >
              <span className="film-card__poster film-skeleton" />
              <span className="film-card__body">
                <span className="catalog-skeleton-card__line catalog-skeleton-card__line--title" />
                <span className="catalog-skeleton-card__line catalog-skeleton-card__line--meta" />
              </span>
            </span>
          ))
        : null}
    </div>
  );
}
