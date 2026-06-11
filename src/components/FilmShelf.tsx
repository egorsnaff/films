import type { CSSProperties } from "react";

import type { KinopoiskFilm } from "../lib/kinopoisk";

import { FilmRatingBadge } from "./FilmRatingBadge";
import { PosterImage } from "./PosterImage";

type FilmShelfProps = {
  title: string;
  subtitle?: string;
  films: KinopoiskFilm[];
  progressByFilm?: Record<number, number>;
  onSelect: (film: KinopoiskFilm) => void;
  onTitleClick?: () => void;
  onShowMore?: () => void;
  showMoreLabel?: string;
  showCount?: boolean;
};

export function FilmShelf({
  title,
  subtitle,
  films,
  progressByFilm,
  onSelect,
  onTitleClick,
  onShowMore,
  showMoreLabel = "Показать ещё",
  showCount = true
}: FilmShelfProps) {
  const titleNode = onTitleClick ? (
    <button type="button" className="film-shelf__title-link" onClick={onTitleClick}>
      {title}
    </button>
  ) : (
    <h2>{title}</h2>
  );

  if (films.length === 0) {
    return (
      <section className="film-shelf film-shelf--empty">
        <div className="film-shelf__head">
          <div>
            {titleNode}
            {subtitle ? <p className="film-shelf__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <p className="hint">Пока пусто — начните смотреть фильм, и он появится здесь.</p>
      </section>
    );
  }

  return (
    <section className="film-shelf">
      <div className="film-shelf__head">
        <div>
          {titleNode}
          {subtitle ? <p className="film-shelf__subtitle">{subtitle}</p> : null}
        </div>
        {showCount ? <span className="film-shelf__count">{films.length}</span> : null}
      </div>
      <div className="film-shelf__track" role="list">
        {films.map((film) => {
          const progress = progressByFilm?.[film.kinopoiskId];
          return (
            <button
              key={film.kinopoiskId}
              type="button"
              className="film-shelf__card film-shelf__card--interactive"
              aria-label={film.title}
              onClick={() => onSelect(film)}
            >
              <span className="film-shelf__poster">
                {film.posterUrl ? (
                  <PosterImage src={film.posterUrl} alt={`Постер ${film.title}`} />
                ) : (
                  <span className="poster-placeholder">Нет постера</span>
                )}
                <FilmRatingBadge rating={film.rating} />
                {typeof progress === "number" && progress > 0 ? (
                  <span
                    className="film-shelf__progress"
                    style={{ "--progress": `${Math.min(progress, 100)}%` } as CSSProperties}
                  />
                ) : null}
              </span>
              <span className="film-shelf__meta">
                <strong>{film.title}</strong>
                <small>
                  {[film.year, film.rating && `КП ${film.rating}`].filter(Boolean).join(" · ")}
                </small>
              </span>
            </button>
          );
        })}
        {onShowMore ? (
          <button
            type="button"
            className="film-shelf__card film-shelf__card--interactive film-shelf__card--show-more"
            aria-label={showMoreLabel}
            onClick={onShowMore}
          >
            <span className="film-shelf__poster film-shelf__poster--show-more">
              <span className="film-shelf__show-more-mark" aria-hidden="true">
                +
              </span>
            </span>
            <span className="film-shelf__meta">
              <strong>{showMoreLabel}</strong>
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
