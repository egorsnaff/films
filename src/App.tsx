import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { FilmGrid } from "./components/FilmGrid";
import { MoviePlayers } from "./components/MoviePlayers";
import { WatchListControls } from "./components/WatchListControls";
import { filmCollections, getCollectionById } from "./data/collections";
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
import {
  siteApi,
  watchStatusLabels,
  type AuthUser,
  type UserFilmEntry,
  type WatchStatus
} from "./lib/siteApi";
import "./styles.css";

const DEFAULT_API_KEY = "e99d6de0-9f14-42e9-b3c6-32172a36d434";
const DEFAULT_API_BASE_URL = "https://kinopoiskapiunofficial.tech/api";

const apiKey = import.meta.env.VITE_KINOPOISK_API_KEY || DEFAULT_API_KEY;
const apiBaseUrl = import.meta.env.VITE_KINOPOISK_API_BASE_URL || DEFAULT_API_BASE_URL;
const allohaToken =
  import.meta.env.VITE_ALLOHA_TOKEN || import.meta.env.VITE_API_ALOHA_KEY;
const hdvbToken = import.meta.env.VITE_HDVB_TOKEN || import.meta.env.VITE_API_HDTV_KEY;
const embedDomain = import.meta.env.VITE_PLAYER_EMBED_DOMAIN || "nayteruz.github.io";
const enableAlloha = import.meta.env.VITE_ENABLE_ALLOHA !== "false";
const envPlayerTemplates = parsePlayerTemplates(import.meta.env.VITE_PLAYER_TEMPLATES);
const playerTemplates =
  envPlayerTemplates.length > 0
    ? envPlayerTemplates
    : getDefaultPlayerTemplates({ includeAlloha: enableAlloha });

type LoadState = "idle" | "loading" | "success" | "error";
type ViewState = "catalog" | "watch" | "collections" | "collection" | "profile";
type CatalogMode = "premieres" | "search" | "films" | "serials";
type MenuItem = "Главная" | "Фильмы" | "Сериалы" | "Подборки" | "Профиль";

const menuItems: MenuItem[] = ["Главная", "Фильмы", "Сериалы", "Подборки", "Профиль"];

const catalogHeadings: Record<CatalogMode, { eyebrow: string; title: string; text: string }> = {
  premieres: {
    eyebrow: "premieres",
    title: "Новинки для вечера",
    text: "Свежая подборка фильмов с хорошим рейтингом. Лента сама подгружает следующую пачку при скролле."
  },
  search: {
    eyebrow: "search results",
    title: "Результаты поиска",
    text: "Подборка по вашему запросу. Откройте карточку, чтобы перейти к плеерам."
  },
  films: {
    eyebrow: "films",
    title: "Фильмы",
    text: "Подборка полнометражных новинок. Листайте вниз, чтобы загрузить ещё."
  },
  serials: {
    eyebrow: "series",
    title: "Сериалы",
    text: "Свежие сериалы с высоким рейтингом. Добавляйте в «Жду продолжения» из страницы просмотра."
  }
};

export function App() {
  const [query, setQuery] = useState("");
  const [films, setFilms] = useState<KinopoiskFilm[]>([]);
  const [selectedFilm, setSelectedFilm] = useState<KinopoiskFilmDetails | null>(null);
  const [status, setStatus] = useState<LoadState>("idle");
  const [detailsStatus, setDetailsStatus] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [view, setView] = useState<ViewState>("catalog");
  const [activeMenu, setActiveMenu] = useState<MenuItem>("Главная");
  const [catalogMode, setCatalogMode] = useState<CatalogMode>("premieres");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [collectionFilms, setCollectionFilms] = useState<KinopoiskFilm[]>([]);
  const [collectionStatus, setCollectionStatus] = useState<LoadState>("idle");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<LoadState>("idle");
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [userLists, setUserLists] = useState<UserFilmEntry[]>([]);
  const [listFilms, setListFilms] = useState<Record<number, KinopoiskFilm>>({});
  const [selectedListStatus, setSelectedListStatus] = useState<WatchStatus | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingMoreRef = useRef(false);
  const pageRef = useRef(1);
  const queryRef = useRef(query);
  queryRef.current = query;

  const client = useMemo(
    () => createKinopoiskClient({ apiKey, baseUrl: apiBaseUrl }),
    []
  );
  const players = selectedFilm ? createPlayerSources(selectedFilm, playerTemplates) : [];
  const visibleFilms = useMemo(
    () =>
      catalogMode === "search"
        ? films
        : films.filter((film) => hasValidPosterUrl(film.posterUrl)),
    [catalogMode, films]
  );
  const detailsStyle = selectedFilm?.posterUrl
    ? ({ "--poster": `url(${selectedFilm.posterUrl})` } as CSSProperties)
    : undefined;
  const activeCollection = collectionId ? getCollectionById(collectionId) : undefined;

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    document.title = "films";
  }, []);

  useEffect(() => {
    void siteApi.getSession().then((user) => {
      setAuthUser(user);
      if (user) {
        void refreshUserLists();
      }
    });
  }, []);

  const refreshUserLists = useCallback(async () => {
    const items = await siteApi.getLists();
    setUserLists(items);

    const details = await Promise.all(
      items.map(async (item) => {
        try {
          const film = await client.getFilm(item.kinopoiskId);
          return [item.kinopoiskId, film] as const;
        } catch {
          return null;
        }
      })
    );

    const nextFilms: Record<number, KinopoiskFilm> = {};
    for (const entry of details) {
      if (entry) {
        nextFilms[entry[0]] = entry[1];
      }
    }
    setListFilms(nextFilms);
  }, [client]);

  const loadCatalogPage = useCallback(
    async ({
      mode,
      nextPage,
      replace
    }: {
      mode: CatalogMode;
      nextPage: number;
      replace: boolean;
    }) => {
      if (replace) {
        setStatus("loading");
      } else {
        setIsLoadingMore(true);
      }

      setError(null);

      try {
        const catalogPage =
          mode === "search"
            ? await client.searchFilms(queryRef.current, nextPage)
            : await client.getRecentFilms(
                nextPage,
                mode === "serials" ? "TV_SERIES" : "FILM"
              );

        setFilms((current) =>
          replace ? catalogPage.films : mergeFilms(current, catalogPage.films)
        );
        setPage(catalogPage.page);
        setTotalPages(catalogPage.totalPages);
        setCatalogMode(mode);
        setHasMore(catalogPage.page < catalogPage.totalPages);
        setStatus("success");
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        setStatus("error");
      } finally {
        setIsLoadingMore(false);
        isFetchingMoreRef.current = false;
      }
    },
    [client]
  );

  const loadNextPage = useCallback(async () => {
    if (!hasMore || isFetchingMoreRef.current || status === "loading" || isLoadingMore) {
      return;
    }

    isFetchingMoreRef.current = true;
    await loadCatalogPage({
      mode: catalogMode,
      nextPage: pageRef.current + 1,
      replace: false
    });
  }, [catalogMode, hasMore, isLoadingMore, loadCatalogPage, status]);

  useEffect(() => {
    void loadCatalogPage({ mode: "premieres", nextPage: 1, replace: true });
  }, [loadCatalogPage]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !hasMore || status === "loading" || isLoadingMore || view !== "catalog") {
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
  }, [catalogMode, hasMore, isLoadingMore, loadNextPage, status, view]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    setSelectedFilm(null);
    setView("catalog");
    setActiveMenu("Главная");
    setIsSearchOpen(false);
    await loadCatalogPage({ mode: "search", nextPage: 1, replace: true });
  }

  async function handleSelectFilm(film: KinopoiskFilm) {
    setError(null);
    setSelectedFilm(null);
    setDetailsStatus("loading");
    setView("watch");
    setSelectedListStatus(
      userLists.find((item) => item.kinopoiskId === film.kinopoiskId)?.status ?? null
    );

    try {
      const details = await client.getFilm(film.kinopoiskId);
      setSelectedFilm(details);
      setDetailsStatus("success");
    } catch (detailsError) {
      setError(getErrorMessage(detailsError));
      setDetailsStatus("error");
    }
  }

  async function openCollection(id: string) {
    const collection = getCollectionById(id);

    if (!collection) {
      return;
    }

    setCollectionId(id);
    setView("collection");
    setActiveMenu("Подборки");
    setCollectionStatus("loading");
    setCollectionFilms([]);

    try {
      const loaded = await Promise.all(
        collection.kinopoiskIds.map(async (kinopoiskId) => {
          try {
            return await client.getFilm(kinopoiskId);
          } catch {
            return null;
          }
        })
      );
      setCollectionFilms(loaded.filter((film): film is KinopoiskFilm => film !== null));
      setCollectionStatus("success");
    } catch {
      setCollectionStatus("error");
    }
  }

  async function handleMenuClick(item: MenuItem) {
    setActiveMenu(item);
    setSelectedFilm(null);
    setDetailsStatus("idle");
    setIsSearchOpen(false);

    if (item === "Подборки") {
      setView("collections");
      return;
    }

    if (item === "Профиль") {
      setView("profile");
      if (authUser) {
        await refreshUserLists();
      }
      return;
    }

    setView("catalog");

    if (item === "Главная") {
      await loadCatalogPage({ mode: "premieres", nextPage: 1, replace: true });
      return;
    }

    if (item === "Фильмы") {
      await loadCatalogPage({ mode: "films", nextPage: 1, replace: true });
      return;
    }

    if (item === "Сериалы") {
      await loadCatalogPage({ mode: "serials", nextPage: 1, replace: true });
    }
  }

  function handleHomeClick() {
    setView("catalog");
    setActiveMenu("Главная");
    setSelectedFilm(null);
    setDetailsStatus("idle");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthStatus("loading");
    setError(null);

    try {
      const user = await siteApi.login(loginForm.username, loginForm.password);
      setAuthUser(user);
      setAuthStatus("success");
      await refreshUserLists();
    } catch (loginError) {
      setError(getErrorMessage(loginError));
      setAuthStatus("error");
    }
  }

  async function handleLogout() {
    await siteApi.logout();
    setAuthUser(null);
    setUserLists([]);
    setListFilms({});
    setSelectedListStatus(null);
  }

  const heading = catalogHeadings[catalogMode];

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />

      <header
        className={`topbar${isSearchOpen ? " topbar--search-active" : ""}`}
        aria-label="Навигация"
      >
        <button className="brand-mark" type="button" onClick={() => void handleMenuClick("Главная")}>
          <span className="brand-mark__glyph">F</span>
          <strong>films</strong>
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
              <button
                key={item}
                type="button"
                className="topbar__nav-link"
                aria-current={item === activeMenu ? "page" : undefined}
                onClick={() => void handleMenuClick(item)}
              >
                {item}
              </button>
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

      {view === "catalog" ? (
        <section className="home-view" id="main">
          <div className="section-heading section-heading--home">
            <p className="eyebrow">{heading.eyebrow}</p>
            <h1>{heading.title}</h1>
            <p>{heading.text}</p>
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

          {visibleFilms.length > 0 ? <FilmGrid films={visibleFilms} onSelect={handleSelectFilm} /> : null}

          <div ref={loadMoreRef} className="load-more-sentinel" aria-live="polite">
            {isLoadingMore
              ? "Загружаем следующую подборку..."
              : hasMore
                ? `Листайте дальше · страница ${page} из ${totalPages}`
                : "Это всё на сейчас"}
          </div>
        </section>
      ) : null}

      {view === "collections" ? (
        <section className="collections-view" id="main">
          <div className="section-heading">
            <p className="eyebrow">collections</p>
            <h1>Подборки фильмов</h1>
            <p>
              Тематические списки, как на киносайтах: жанры, настроение и сценарии просмотра.
              Раздел можно расширять вручную в <code>src/data/collections.ts</code>.
            </p>
          </div>
          <div className="collections-grid">
            {filmCollections.map((collection) => (
              <button
                key={collection.id}
                type="button"
                className="collection-card"
                style={{ "--collection-accent": collection.accent } as CSSProperties}
                onClick={() => void openCollection(collection.id)}
              >
                <span className="collection-card__badge">{collection.kinopoiskIds.length} тайтлов</span>
                <strong>{collection.title}</strong>
                <p>{collection.description}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view === "collection" && activeCollection ? (
        <section className="collection-detail-view" id="main">
          <button className="back-button" type="button" onClick={() => setView("collections")}>
            Ко всем подборкам
          </button>
          <div className="section-heading">
            <p className="eyebrow">collection</p>
            <h1>{activeCollection.title}</h1>
            <p>{activeCollection.description}</p>
          </div>
          {collectionStatus === "loading" ? <p className="player-status">Загружаем подборку...</p> : null}
          {collectionFilms.length > 0 ? (
            <FilmGrid films={collectionFilms} onSelect={handleSelectFilm} />
          ) : collectionStatus === "success" ? (
            <div className="empty-state">
              <strong>В подборке пока нет доступных карточек.</strong>
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "profile" ? (
        <section className="profile-view" id="main">
          <div className="section-heading">
            <p className="eyebrow">profile</p>
            <h1>Профиль</h1>
            <p>
              Регистрация только вручную через базу на сервере. Публичной формы регистрации нет.
            </p>
          </div>

          {!authUser ? (
            <form className="profile-login" onSubmit={handleLogin}>
              <label>
                Логин
                <input
                  value={loginForm.username}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </label>
              <label>
                Пароль
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>
              <button type="submit" disabled={authStatus === "loading"}>
                {authStatus === "loading" ? "Входим..." : "Войти"}
              </button>
            </form>
          ) : (
            <div className="profile-panel">
              <p>
                Вы вошли как <strong>{authUser.username}</strong>
              </p>
              <button type="button" className="back-button" onClick={() => void handleLogout()}>
                Выйти
              </button>
            </div>
          )}

          {authUser
            ? (["watching", "plan", "waiting", "watched"] as WatchStatus[]).map((statusKey) => {
                const items = userLists.filter((item) => item.status === statusKey);
                return (
                  <section key={statusKey} className="profile-list-block">
                    <h2>{watchStatusLabels[statusKey]}</h2>
                    {items.length === 0 ? (
                      <p className="hint">Пока пусто.</p>
                    ) : (
                      <FilmGrid
                        films={items
                          .map((item) => listFilms[item.kinopoiskId])
                          .filter((film): film is KinopoiskFilm => Boolean(film))}
                        onSelect={handleSelectFilm}
                      />
                    )}
                  </section>
                );
              })
            : null}
        </section>
      ) : null}

      {view === "watch" ? (
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
                <WatchListControls
                  kinopoiskId={selectedFilm.kinopoiskId}
                  currentStatus={selectedListStatus ?? undefined}
                  isAuthenticated={Boolean(authUser)}
                  onStatusChange={(nextStatus) => {
                    setSelectedListStatus(nextStatus);
                    if (authUser) {
                      void refreshUserLists();
                    }
                  }}
                />
              </div>

              <div className="watch-card__player">
                <MoviePlayers
                  players={players}
                  resolveOptions={{ allohaToken, hdvbToken, embedDomain }}
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
      ) : null}
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
