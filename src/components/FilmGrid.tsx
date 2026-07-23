import type { CSSProperties } from "react";

import { buildWatchFilmUrl } from "../lib/appRoutes";
import type { KinopoiskFilm } from "../lib/kinopoisk";

import { FilmRatingBadge } from "./FilmRatingBadge";
import { FilmCardAwards } from "./FilmCardAwards";
import { PosterImage } from "./PosterImage";

type FilmGridProps = {
  films: KinopoiskFilm[];
  animate?: boolean;
  loadingSkeletonCount?: number;
};

export function FilmGrid({ films, animate = true, loadingSkeletonCount = 0 }: FilmGridProps) {
  return (
    <div className={`film-grid${animate ? " film-grid--revealed" : ""}`}>
      {films.map((film, index) => (
        <a
          key={film.kinopoiskId}
          className="film-card film-card--interactive"
          href={buildWatchFilmUrl(film.kinopoiskId)}
          target="_blank"
          rel="noopener noreferrer"
          style={animate ? ({ "--stagger": index } as CSSProperties) : undefined}
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
            {film.awardChips && film.awardChips.length > 0 ? (
              <FilmCardAwards chips={film.awardChips} />
            ) : null}
          </span>
        </a>
      ))}
      {loadingSkeletonCount > 0
        ? Array.from({ length: loadingSkeletonCount }).map((_, index) => (
            <span
              key={`catalog-skeleton-${index}`}
              className="catalog-skeleton-card film-card--skeleton"
              aria-hidden="true"
            >
              <span className="catalog-skeleton-card__poster film-skeleton" />
              <span className="catalog-skeleton-card__body">
                <span className="catalog-skeleton-card__line catalog-skeleton-card__line--title" />
                <span className="catalog-skeleton-card__line catalog-skeleton-card__line--meta" />
              </span>
            </span>
          ))
        : null}
    </div>
  );
}
