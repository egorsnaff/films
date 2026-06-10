import type { CSSProperties } from "react";

import type { KinopoiskFilm } from "../lib/kinopoisk";

type WatchDetailsPreloaderProps = {
  film?: KinopoiskFilm | null;
};

export function WatchDetailsPreloader({ film }: WatchDetailsPreloaderProps) {
  const posterStyle = film?.posterUrl
    ? ({ "--preloader-poster": `url(${film.posterUrl})` } as CSSProperties)
    : undefined;

  return (
    <div
      className="watch-preloader"
      role="status"
      aria-live="polite"
      aria-label="Загружаем детали фильма"
      style={posterStyle}
    >
      <div className="watch-preloader__veil" aria-hidden="true" />
      <div className="watch-preloader__curtain watch-preloader__curtain--left" aria-hidden="true" />
      <div className="watch-preloader__curtain watch-preloader__curtain--right" aria-hidden="true" />

      <div className="watch-preloader__stage">
        <div className="watch-preloader__halo" aria-hidden="true" />

        <div className="watch-preloader__poster-shell">
          {film?.posterUrl ? (
            <img
              className="watch-preloader__poster"
              src={film.posterUrl}
              alt=""
              aria-hidden="true"
            />
          ) : (
            <div className="watch-preloader__poster watch-preloader__poster--placeholder" aria-hidden="true" />
          )}
          <span className="watch-preloader__frame" aria-hidden="true" />
        </div>

        <div className="watch-preloader__brand" aria-hidden="true">
          <span className="watch-preloader__glyph">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M5 24c4.2-9.8 8.4-13.8 11-13.8s6.8 4 11 13.8"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <circle cx="16" cy="10.8" r="2" fill="currentColor" />
            </svg>
          </span>
          <span className="watch-preloader__brand-copy">
            <strong>Сеанс</strong>
            <small>готовим зал</small>
          </span>
        </div>

        {film?.title ? (
          <p className="watch-preloader__title">{film.title}</p>
        ) : (
          <p className="watch-preloader__title watch-preloader__title--placeholder">Загружаем фильм</p>
        )}

        <div className="watch-preloader__progress" aria-hidden="true">
          <span className="watch-preloader__progress-track">
            <span className="watch-preloader__progress-fill" />
          </span>
        </div>

        <p className="watch-preloader__caption">Собираем описание, жанры и плееры</p>
      </div>
    </div>
  );
}
