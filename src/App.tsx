import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { MoviePlayers } from "./components/MoviePlayers";
import {
  KinopoiskFilm,
  KinopoiskFilmDetails,
  createKinopoiskClient
} from "./lib/kinopoisk";
import {
  createPlayerSources,
  getDefaultPlayerTemplates,
  parsePlayerTemplates
} from "./lib/playerSources";
import "./styles.css";

const DEFAULT_API_KEY = "e99d6de0-9f14-42e9-b3c6-32172a36d434";
const DEFAULT_API_BASE_URL = "https://kinopoiskapiunofficial.tech/api";

const apiKey = import.meta.env.VITE_KINOPOISK_API_KEY || DEFAULT_API_KEY;
const apiBaseUrl = import.meta.env.VITE_KINOPOISK_API_BASE_URL || DEFAULT_API_BASE_URL;
const allohaToken = import.meta.env.VITE_ALLOHA_TOKEN;
const hdvbToken = import.meta.env.VITE_HDVB_TOKEN || import.meta.env.VITE_API_HDTV_KEY;
const enableAlloha = import.meta.env.VITE_ENABLE_ALLOHA === "true";
const envPlayerTemplates = parsePlayerTemplates(import.meta.env.VITE_PLAYER_TEMPLATES);
const playerTemplates =
  envPlayerTemplates.length > 0
    ? envPlayerTemplates
    : getDefaultPlayerTemplates({ includeAlloha: enableAlloha });

type LoadState = "idle" | "loading" | "success" | "error";

const quickPicks = ["Матрица", "Интерстеллар", "Зелёная миля", "Две крепости"];

export function App() {
  const [query, setQuery] = useState("матрица");
  const [films, setFilms] = useState<KinopoiskFilm[]>([]);
  const [selectedFilm, setSelectedFilm] = useState<KinopoiskFilmDetails | null>(null);
  const [status, setStatus] = useState<LoadState>("idle");
  const [detailsStatus, setDetailsStatus] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(
    () => createKinopoiskClient({ apiKey, baseUrl: apiBaseUrl }),
    []
  );
  const players = selectedFilm ? createPlayerSources(selectedFilm, playerTemplates) : [];
  const detailsStyle = selectedFilm?.posterUrl
    ? ({ "--poster": `url(${selectedFilm.posterUrl})` } as CSSProperties)
    : undefined;

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSelectedFilm(null);
    setStatus("loading");

    try {
      const results = await client.searchFilms(query);
      setFilms(results);
      setStatus("success");
    } catch (searchError) {
      setError(getErrorMessage(searchError));
      setStatus("error");
    }
  }

  function handleQuickPick(nextQuery: string) {
    setQuery(nextQuery);
  }

  async function handleSelectFilm(film: KinopoiskFilm) {
    setError(null);
    setSelectedFilm(null);
    setDetailsStatus("loading");

    try {
      const details = await client.getFilm(film.kinopoiskId);
      setSelectedFilm(details);
      setDetailsStatus("success");
    } catch (detailsError) {
      setError(getErrorMessage(detailsError));
      setDetailsStatus("error");
    }
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <header className="topbar" aria-label="Навигация">
        <a className="brand-mark" href="#search">
          <span className="brand-mark__glyph">F</span>
          <span>
            <strong>films</strong>
            <small>Кинотеатр в браузере</small>
          </span>
        </a>
        <nav className="topbar__nav" aria-label="Разделы">
          <a href="#search">поиск</a>
          <a href="#results">каталог</a>
          <a href="#watch">плееры</a>
        </nav>
        <p className="topbar__status">поиск, детали и плееры в одном экране</p>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <p className="eyebrow">Kinopoisk API / player hub</p>
          <h1 id="hero-title">
            Найди фильм.
            <span> Выбери плеер.</span>
            <em> Смотри без лишних переходов.</em>
          </h1>
          <p>
            Быстрый экран для поиска, проверки рейтинга и запуска доступных
            embed-плееров. Интерфейс собран как компактная витрина онлайн-кинотеатра.
          </p>
        </div>

        <form className="search-form" id="search" onSubmit={handleSearch}>
          <div className="search-form__header">
            <label htmlFor="search-input">Название фильма</label>
            <span>{status === "loading" ? "ищем в базе" : "Kinopoisk unofficial"}</span>
          </div>
          <div className="search-form__control">
            <input
              id="search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: Интерстеллар"
            />
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Ищем..." : "Найти"}
            </button>
          </div>
          <div className="quick-picks" aria-label="Быстрые запросы">
            {quickPicks.map((pick) => (
              <button
                key={pick}
                type="button"
                className="quick-pick"
                onClick={() => handleQuickPick(pick)}
              >
                {pick}
              </button>
            ))}
          </div>
        </form>

        <div className="hero__poster-stage" aria-hidden="true">
          <div className="poster-orbit poster-orbit--one" />
          <div className="poster-orbit poster-orbit--two" />
          <div className="poster-stack">
            {(films.length > 0 ? films.slice(0, 3) : []).map((film, index) =>
              film.posterUrl ? (
                <img
                  key={film.kinopoiskId}
                  className={`poster-stack__item poster-stack__item--${index + 1}`}
                  src={film.posterUrl}
                  alt=""
                />
              ) : null
            )}
            {films.length === 0 ? (
              <>
                <span className="poster-stack__placeholder poster-stack__item--1" />
                <span className="poster-stack__placeholder poster-stack__item--2" />
                <span className="poster-stack__placeholder poster-stack__item--3" />
              </>
            ) : null}
          </div>
          <p className="stage-caption">
            <span>{films.length || "0"}</span>
            найдено
          </p>
        </div>
      </section>

      {error ? <p className="error-message">{error}</p> : null}

      <section className="content-grid" id="results">
        <section className="film-list" aria-live="polite" aria-label="Результаты поиска">
          <div className="section-heading">
            <p className="eyebrow">poster rail</p>
            <h2>Результаты поиска</h2>
            <span>{films.length > 0 ? `${films.length} тайтлов` : "ожидает запрос"}</span>
          </div>

          {status === "loading" ? (
            <div className="skeleton-grid" aria-label="Загрузка результатов">
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="film-skeleton" />
              ))}
            </div>
          ) : null}

          {films.length === 0 && status !== "loading" ? (
            <div className="empty-state empty-state--composed">
              <span className="empty-state__marker">01</span>
              <strong>Введите название и запустите поиск.</strong>
              <p>Начните с классики или выберите один из быстрых запросов выше.</p>
            </div>
          ) : null}

          {films.length > 0 ? (
            <div className="film-grid">
              {films.map((film) => (
                <button
                  key={film.kinopoiskId}
                  type="button"
                  className={`film-card ${
                    selectedFilm?.kinopoiskId === film.kinopoiskId
                      ? "film-card--active"
                      : ""
                  }`}
                  aria-pressed={selectedFilm?.kinopoiskId === film.kinopoiskId}
                  onClick={() => void handleSelectFilm(film)}
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
          ) : null}
        </section>

        <aside
          className={`details-panel ${selectedFilm ? "details-panel--active" : ""}`}
          id="watch"
          style={detailsStyle}
        >
          {detailsStatus === "loading" ? (
            <div className="details-loading">
              <span />
              <p>Загружаем детали...</p>
            </div>
          ) : null}
          {selectedFilm ? (
            <>
              <div className="details-hero">
                {selectedFilm.posterUrl ? (
                  <img src={selectedFilm.posterUrl} alt={`Постер ${selectedFilm.title}`} />
                ) : null}
                <div>
                  <p className="eyebrow">now selected</p>
                  <h2>{selectedFilm.title}</h2>
                  <p className="meta">
                    {[
                      selectedFilm.originalTitle,
                      selectedFilm.year,
                      selectedFilm.rating && `КП ${selectedFilm.rating}`,
                      selectedFilm.genres?.join(", ")
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              {selectedFilm.description ? (
                <p className="description">{selectedFilm.description}</p>
              ) : null}
              <MoviePlayers
                players={players}
                resolveOptions={{ allohaToken, hdvbToken }}
              />
              {players.length === 0 ? (
                <p className="hint">
                  Добавьте <code>VITE_PLAYER_TEMPLATES</code>, чтобы подключить свои
                  embed-плееры или будущий сервер.
                </p>
              ) : null}
            </>
          ) : (
            <div className="empty-state empty-state--watch">
              <span className="empty-state__marker">02</span>
              <strong>Выберите фильм, чтобы открыть плееры.</strong>
              <p>
                Здесь появится постер, описание, рейтинг и вкладки доступных источников.
              </p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Что-то пошло не так";
}
