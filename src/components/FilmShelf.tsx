import type { CSSProperties } from "react";

import type { KinopoiskFilm } from "../lib/kinopoisk";

import { FilmRatingBadge } from "./FilmRatingBadge";

type FilmShelfProps = {
  title: string;
  subtitle?: string;
  films: KinopoiskFilm[];
  progressByFilm?: Record<number, number>;
  onSelect: (film: KinopoiskFilm) => void;
};

export function FilmShelf({ title, subtitle, films, progressByFilm, onSelect }: FilmShelfProps) {
  if (films.length === 0) {
    return (
      <section className="film-shelf film-shelf--empty">
        <div className="film-shelf__head">
          <div>
            <h2>{title}</h2>
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
          <h2>{title}</h2>
          {subtitle ? <p className="film-shelf__subtitle">{subtitle}</p> : null}
        </div>
        <span className="film-shelf__count">{films.length}</span>
      </div>
      <div className="film-shelf__track" role="list">
        {films.map((film) => {
          const progress = progressByFilm?.[film.kinopoiskId];
          return (
            <button
              key={film.kinopoiskId}
              type="button"
              className="film-shelf__card film-shelf__card--interactive"
              role="listitem"
              onClick={() => onSelect(film)}
            >
              <span className="film-shelf__poster">
                {film.posterUrl ? (
                  <img src={film.posterUrl} alt="" loading="lazy" />
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
      </div>
    </section>
  );
}
