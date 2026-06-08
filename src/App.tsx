import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { MoviePlayers } from "./components/MoviePlayers";
import {
  KinopoiskFilm,
  KinopoiskFilmDetails,
  createKinopoiskClient,
  hasValidPosterUrl
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
const allohaToken =
  import.meta.env.VITE_ALLOHA_TOKEN || import.meta.env.VITE_API_ALOHA_KEY;
const hdvbToken = import.meta.env.VITE_HDVB_TOKEN || import.meta.env.VITE_API_HDTV_KEY;
const enableAlloha = import.meta.env.VITE_ENABLE_ALLOHA !== "false";
const envPlayerTemplates = parsePlayerTemplates(import.meta.env.VITE_PLAYER_TEMPLATES);
const playerTemplates =
  envPlayerTemplates.length > 0
    ? envPlayerTemplates
    : getDefaultPlayerTemplates({ includeAlloha: enableAlloha });

type LoadState = "idle" | "loading" | "success" | "error";
type ViewState = "home" | "watch";
type CatalogMode = "premieres" | "search";

const menuItems = ["Главная", "Фильмы", "Сериалы", "Подборки", "Профиль"];

export function App() {
  const [query, setQuery] = useState("");
  const [films, setFilms] = useState<KinopoiskFilm[]>([]);
  const [selectedFilm, setSelectedFilm] = useState<KinopoiskFilmDetails | null>(null);
  const [status, setStatus] = useState<LoadState>("idle");
  const [detailsStatus, setDetailsStatus] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [view, setView] = useState<ViewState>("home");
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("premieres");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const client = useMemo(
    () => createKinopoiskClient({ apiKey, baseUrl: apiBaseUrl }),
    []
  );
  const players = selectedFilm ? createPlayerSources(selectedFilm, playerTemplates) : [];
  const visibleFilms = useMemo(
    () =>
      catalogMode === "premieres"
        ? films.filter((film) => hasValidPosterUrl(film.posterUrl))
        : films,
    [catalogMode, films]
  );
  const detailsStyle = selectedFilm?.posterUrl
    ? ({ "--poster": `url(${selectedFilm.posterUrl})` } as CSSProperties)
    : undefined;

  useEffect(() => {
    void loadCatalogPage({ mode: "premieres", nextPage: 1, replace: true });
  }, []);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !hasMore || status === "loading" || isLoadingMore || view !== "home") {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadNextPage();
        }
      },
      { rootMargin: "480px" }
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [catalogMode, hasMore, isLoadingMore, page, query, status, view]);

  async function loadCatalogPage({
    mode,
    nextPage,
    replace
  }: {
    mode: CatalogMode;
    nextPage: number;
    replace: boolean;
  }) {
    if (replace) {
      setStatus("loading");
    } else {
      setIsLoadingMore(true);
    }

    setError(null);

    try {
      const results =
        mode === "search"
          ? await client.searchFilms(query, nextPage)
          : await client.getRecentFilms(nextPage);
      setFilms((current) => (replace ? results : mergeFilms(current, results)));
      setPage(nextPage);
      setCatalogMode(mode);
      setHasMore(results.length > 0);
      setStatus("success");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      setStatus("error");
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function loadNextPage() {
    if (!hasMore || status === "loading" || isLoadingMore) {
      return;
    }

    await loadCatalogPage({
      mode: catalogMode,
      nextPage: page + 1,
      replace: false
    });
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    setSelectedFilm(null);
    setView("home");
    setIsSearchOpen(false);
    await loadCatalogPage({ mode: "search", nextPage: 1, replace: true });
  }

  async function handleSelectFilm(film: KinopoiskFilm) {
    setError(null);
    setSelectedFilm(null);
    setDetailsStatus("loading");
    setView("watch");

    try {
      const details = await client.getFilm(film.kinopoiskId);
      setSelectedFilm(details);
      setDetailsStatus("success");
    } catch (detailsError) {
      setError(getErrorMessage(detailsError));
      setDetailsStatus("error");
    }
  }

  function handleHomeClick() {
    setView("home");
    setSelectedFilm(null);
    setDetailsStatus("idle");
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <header
        className={`topbar${isSearchOpen ? " topbar--search-active" : ""}`}
        aria-label="Навигация"
      >
        <button className="brand-mark" type="button" onClick={handleHomeClick}>
          <span className="brand-mark__glyph">F</span>
          <span>
            <strong>films</strong>
            <small>Кинотеатр в браузере</small>
          </span>
        </button>
        {isSearchOpen ? (
          <form
            className="topbar__search"
            id="top-search"
            role="search"
            onSubmit={handleSearch}
          >
            <input
              id="search-input"
              aria-label="Поиск фильма"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Фильм, сериал, мультфильм"
              autoFocus
            />
            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Ищем..." : "Найти"}
            </button>
          </form>
        ) : (
          <nav className="topbar__nav" aria-label="Разделы">
            {menuItems.map((item) => (
              <a key={item} href="#main" aria-current={item === "Главная" ? "page" : undefined}>
                {item}
              </a>
            ))}
          </nav>
        )}
        <button
          type="button"
          className="search-toggle"
          aria-expanded={isSearchOpen}
          aria-controls="top-search"
          aria-label={isSearchOpen ? "Закрыть поиск" : "Открыть поиск"}
          onClick={() => setIsSearchOpen((current) => !current)}
        >
          <span aria-hidden="true" />
        </button>
      </header>

      {error ? <p className="error-message">{error}</p> : null}

      {view === "home" ? (
        <section className="home-view" id="main">
          <div className="section-heading section-heading--home">
            <p className="eyebrow">{catalogMode === "search" ? "search results" : "premieres"}</p>
            <h1>{catalogMode === "search" ? "Результаты поиска" : "Новинки для вечера"}</h1>
            <p>
              {catalogMode === "search"
                ? "Подборка по вашему запросу. Откройте карточку, чтобы перейти к плеерам."
                : "Свежая подборка фильмов с хорошим рейтингом. Лента сама подгружает следующую пачку при скролле."}
            </p>
          </div>

          {status === "loading" ? (
            <div className="skeleton-grid" aria-label="Загрузка результатов">
              {Array.from({ length: 10 }).map((_, index) => (
                <span key={index} className="film-skeleton" />
              ))}
            </div>
          ) : null}

          {visibleFilms.length === 0 && status !== "loading" ? (
            <div className="empty-state empty-state--composed">
              <span className="empty-state__marker">01</span>
              <strong>Пока ничего не найдено.</strong>
              <p>Откройте поиск сверху и попробуйте другой запрос.</p>
            </div>
          ) : null}

          {visibleFilms.length > 0 ? (
            <div className="film-grid">
              {visibleFilms.map((film) => (
                <button
                  key={film.kinopoiskId}
                  type="button"
                  className="film-card"
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

          <div ref={loadMoreRef} className="load-more-sentinel" aria-live="polite">
            {isLoadingMore
              ? "Загружаем следующую подборку..."
              : hasMore
                ? "Листайте дальше"
                : "Это всё на сейчас"}
          </div>
        </section>
      ) : (
        <section className="watch-page" id="main">
          <button className="back-button" type="button" onClick={handleHomeClick}>
            Вернуться на главную
          </button>
          <p className="eyebrow">Страница просмотра</p>
          {detailsStatus === "loading" ? (
            <div className="details-loading">
              <span />
              <p>Загружаем детали...</p>
            </div>
          ) : null}
          {selectedFilm ? (
            <article className="watch-card details-panel--active" style={detailsStyle}>
              <div className="watch-card__info">
                <div className="details-hero">
                  {selectedFilm.posterUrl ? (
                    <img src={selectedFilm.posterUrl} alt={`Постер ${selectedFilm.title}`} />
                  ) : null}
                  <div>
                    <h1>{selectedFilm.title}</h1>
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
              </div>

              <div className="watch-card__player">
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
              </div>
            </article>
          ) : detailsStatus !== "loading" ? (
            <div className="empty-state empty-state--watch">
              <strong>Фильм не выбран.</strong>
              <p>Вернитесь на главную и откройте карточку из подборки.</p>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}

function mergeFilms(current: KinopoiskFilm[], next: KinopoiskFilm[]): KinopoiskFilm[] {
  const seen = new Set(current.map((film) => film.kinopoiskId));
  const uniqueNext = next.filter((film) => {
    if (seen.has(film.kinopoiskId)) {
      return false;
    }

    seen.add(film.kinopoiskId);
    return true;
  });

  return [...current, ...uniqueNext];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Что-то пошло не так";
}
