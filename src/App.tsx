import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { BackButton } from "./components/BackButton";
import { FilmGrid } from "./components/FilmGrid";
import { FilmShelf } from "./components/FilmShelf";
import { MoviePlayers } from "./components/MoviePlayers";
import { UserMenu } from "./components/UserMenu";
import { WatchListControls } from "./components/WatchListControls";
import { useWatchTracker } from "./hooks/useWatchTracker";
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
  pushAppHistory,
  readHistorySnapshot,
  replaceAppHistory
} from "./lib/appHistory";
import {
  getBackLabel,
  type CatalogMode,
  type MenuItem,
  type NavigationSnapshot,
  type ViewState
} from "./lib/navigation";
import {
  siteApi,
  watchStatusLabels,
  type AuthUser,
  type RecommendationResponse,
  type UserFilmEntry,
  type WatchStatus
} from "./lib/siteApi";
import "./styles.css";

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
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [recommendationsStatus, setRecommendationsStatus] = useState<LoadState>("idle");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isFetchingMoreRef = useRef(false);
  const lastLoadMoreAtRef = useRef(0);
  const pageRef = useRef(1);
  const filmsRef = useRef<KinopoiskFilm[]>([]);
  const hasMoreRef = useRef(hasMore);
  const catalogModeRef = useRef(catalogMode);
  const queryRef = useRef(query);
  const navHistoryRef = useRef<NavigationSnapshot[]>([]);
  const pendingWatchFilmIdRef = useRef<number | null>(null);
  const isHistoryNavigationRef = useRef(false);
  const shouldCommitHistoryRef = useRef(false);
  queryRef.current = query;
  filmsRef.current = films;
  hasMoreRef.current = hasMore;
  catalogModeRef.current = catalogMode;

  const client = useMemo(() => createKinopoiskClient(), []);
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
  const selectedListEntry = selectedFilm
    ? userLists.find((item) => item.kinopoiskId === selectedFilm.kinopoiskId)
    : undefined;
  const progressByFilm = useMemo(() => {
    const map: Record<number, number> = {};
    for (const item of userLists) {
      if (item.progressPercent) {
        map[item.kinopoiskId] = item.progressPercent;
      }
    }
    return map;
  }, [userLists]);
  const backLabel = getBackLabel(navHistoryRef.current.at(-1));
  const recommendationFilms = useMemo(
    () =>
      (recommendations?.films ?? []).filter((film) => hasValidPosterUrl(film.posterUrl)),
    [recommendations]
  );
  const recommendationTitle =
    recommendations?.mode === "cold"
      ? "250 лучших, которые вы ещё не смотрели"
      : "На основе ваших интересов";
  const showRecommendations =
    Boolean(authUser) && catalogMode === "premieres" && recommendationFilms.length > 0;

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const refreshUserLists = useCallback(async () => {
    const { items, films } = await siteApi.getLists();
    setUserLists(items);
    setListFilms((current) => ({ ...current, ...films }));
  }, []);

  const loadRecommendations = useCallback(async () => {
    setRecommendationsStatus("loading");

    try {
      const result = await siteApi.getRecommendations();
      setRecommendations(result);
      setRecommendationsStatus("success");
    } catch {
      setRecommendations(null);
      setRecommendationsStatus("error");
    }
  }, []);

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
  }, [refreshUserLists]);

  useEffect(() => {
    if (!authUser || view !== "catalog" || catalogMode !== "premieres") {
      return;
    }

    void loadRecommendations();
  }, [authUser, catalogMode, loadRecommendations, userLists, view]);

  const handleWatchTrackerStatusChange = useCallback(
    (status: WatchStatus) => {
      setSelectedListStatus(status);
      void refreshUserLists();
    },
    [refreshUserLists]
  );

  const { markPlaybackStarted, reportPosition } = useWatchTracker({
    enabled: Boolean(authUser && view === "watch" && selectedFilm),
    kinopoiskId: selectedFilm?.kinopoiskId,
    filmLengthMinutes: selectedFilm?.filmLengthMinutes,
    currentStatus: selectedListStatus,
    onStatusChange: handleWatchTrackerStatusChange
  });

  const captureSnapshot = useCallback((): NavigationSnapshot => {
    return {
      view,
      activeMenu,
      catalogMode,
      collectionId,
      filmId:
        view === "watch"
          ? (selectedFilm?.kinopoiskId ?? pendingWatchFilmIdRef.current)
          : null,
      searchQuery: catalogMode === "search" ? query : "",
      scrollY: window.scrollY
    };
  }, [activeMenu, catalogMode, collectionId, query, selectedFilm, view]);

  const beginHistoryEntry = useCallback(
    (pushHistory = true) => {
      if (pushHistory && !isHistoryNavigationRef.current) {
        navHistoryRef.current.push(captureSnapshot());
      }
    },
    [captureSnapshot]
  );

  const requestHistoryCommit = useCallback((pushHistory = true) => {
    if (pushHistory && !isHistoryNavigationRef.current) {
      shouldCommitHistoryRef.current = true;
    }
  }, []);

  const restoreSnapshot = useCallback(
    async (snapshot: NavigationSnapshot) => {
      setActiveMenu(snapshot.activeMenu);
      setCatalogMode(snapshot.catalogMode);
      setCollectionId(snapshot.collectionId);
      setIsSearchOpen(false);
      setError(null);

      if (snapshot.view === "watch" && snapshot.filmId) {
        setView("watch");
        setSelectedFilm(null);
        setDetailsStatus("loading");
        setSelectedListStatus(
          userLists.find((item) => item.kinopoiskId === snapshot.filmId)?.status ?? null
        );

        try {
          const details = await client.getFilm(snapshot.filmId);
          setSelectedFilm(details);
          setDetailsStatus("success");
        } catch (detailsError) {
          setError(getErrorMessage(detailsError));
          setDetailsStatus("error");
        }
      } else if (snapshot.view === "collection" && snapshot.collectionId) {
        setView("collection");
        const collection = getCollectionById(snapshot.collectionId);
        if (collection) {
          setCollectionStatus("loading");
          try {
            const page =
              collection.source.kind === "top"
                ? await client.getTopFilms(collection.source.type, 1)
                : await client.getThemeFilms(collection.source.type, 1);
            setCollectionFilms(page.films);
            setCollectionStatus("success");
          } catch {
            setCollectionStatus("error");
          }
        }
      } else if (snapshot.view === "collections") {
        setView("collections");
        setSelectedFilm(null);
        setDetailsStatus("idle");
      } else if (snapshot.view === "profile") {
        setView("profile");
        setSelectedFilm(null);
        setDetailsStatus("idle");
        if (authUser) {
          await refreshUserLists();
        }
      } else {
        setView("catalog");
        setSelectedFilm(null);
        setDetailsStatus("idle");

        if (snapshot.catalogMode === "search" && snapshot.searchQuery) {
          setQuery(snapshot.searchQuery);
          setStatus("loading");
          setError(null);

          try {
            const page = await client.searchFilms(snapshot.searchQuery, 1);
            setFilms(page.films);
            setPage(page.page);
            setHasMore(page.page < page.totalPages);
            setStatus("success");
          } catch (searchError) {
            setError(getErrorMessage(searchError));
            setStatus("error");
          }
        }
      }

      pendingWatchFilmIdRef.current = null;

      requestAnimationFrame(() => {
        window.scrollTo({ top: snapshot.scrollY, behavior: "auto" });
      });
    },
    [authUser, client, refreshUserLists, userLists]
  );

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    const snapshot = navHistoryRef.current.pop();
    if (!snapshot) {
      setView("catalog");
      setActiveMenu("Главная");
      setSelectedFilm(null);
      setDetailsStatus("idle");
      return;
    }

    void restoreSnapshot(snapshot);
  }, [restoreSnapshot]);

  useEffect(() => {
    if (!readHistorySnapshot(window.history.state)) {
      replaceAppHistory(captureSnapshot());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!shouldCommitHistoryRef.current || isHistoryNavigationRef.current) {
      return;
    }

    shouldCommitHistoryRef.current = false;
    pushAppHistory(captureSnapshot());
  }, [view, activeMenu, catalogMode, collectionId, selectedFilm, captureSnapshot]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      isHistoryNavigationRef.current = true;

      if (navHistoryRef.current.length > 0) {
        navHistoryRef.current.pop();
      }

      const snapshot = readHistorySnapshot(event.state);
      if (snapshot) {
        void restoreSnapshot(snapshot);
      } else {
        setView("catalog");
        setActiveMenu("Главная");
        setCatalogMode("premieres");
        setCollectionId(null);
        setSelectedFilm(null);
        setDetailsStatus("idle");
      }

      window.requestAnimationFrame(() => {
        isHistoryNavigationRef.current = false;
      });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [restoreSnapshot]);

  const loadCatalogPage = useCallback(
    async ({
      mode,
      nextPage,
      replace,
      autoChaseDepth = 0
    }: {
      mode: CatalogMode;
      nextPage: number;
      replace: boolean;
      autoChaseDepth?: number;
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

        const previousFilms = filmsRef.current;
        const merged = replace ? catalogPage.films : mergeFilms(previousFilms, catalogPage.films);
        const previousVisibleCount = countVisibleFilms(previousFilms, mode);
        const nextVisibleCount = countVisibleFilms(merged, mode);
        const shouldLoadAnotherPage =
          !replace &&
          catalogPage.page < catalogPage.totalPages &&
          nextVisibleCount === previousVisibleCount;

        setFilms(merged);
        filmsRef.current = merged;
        setPage(catalogPage.page);
        pageRef.current = catalogPage.page;
        setTotalPages(catalogPage.totalPages);
        setCatalogMode(mode);
        catalogModeRef.current = mode;
        const nextHasMore = catalogPage.page < catalogPage.totalPages;
        setHasMore(nextHasMore);
        hasMoreRef.current = nextHasMore;
        setStatus("success");

        if (shouldLoadAnotherPage && autoChaseDepth < 3) {
          await loadCatalogPage({
            mode,
            nextPage: catalogPage.page + 1,
            replace: false,
            autoChaseDepth: autoChaseDepth + 1
          });
          return;
        }
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        setStatus("error");
        setHasMore(false);
        hasMoreRef.current = false;
      } finally {
        setIsLoadingMore(false);
        isFetchingMoreRef.current = false;
      }
    },
    [client]
  );

  const loadNextPage = useCallback(async () => {
    if (!hasMoreRef.current || isFetchingMoreRef.current) {
      return;
    }

    isFetchingMoreRef.current = true;
    await loadCatalogPage({
      mode: catalogModeRef.current,
      nextPage: pageRef.current + 1,
      replace: false
    });
  }, [loadCatalogPage]);

  const loadNextPageRef = useRef(loadNextPage);
  loadNextPageRef.current = loadNextPage;

  const maybeLoadMoreFromScroll = useCallback(() => {
    if (view !== "catalog" || !hasMoreRef.current || isFetchingMoreRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastLoadMoreAtRef.current < 1200) {
      return;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const rect = target.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 320) {
      lastLoadMoreAtRef.current = now;
      void loadNextPageRef.current();
    }
  }, [view]);

  useEffect(() => {
    void loadCatalogPage({ mode: "premieres", nextPage: 1, replace: true });
  }, [loadCatalogPage]);

  useEffect(() => {
    if (view !== "catalog") {
      return;
    }

    const onScroll = () => maybeLoadMoreFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [maybeLoadMoreFromScroll, view]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!query.trim()) {
      return;
    }

    beginHistoryEntry();
    setSelectedFilm(null);
    setView("catalog");
    setActiveMenu("Главная");
    setIsSearchOpen(false);
    await loadCatalogPage({ mode: "search", nextPage: 1, replace: true });
    requestHistoryCommit();
  }

  async function openFilm(film: KinopoiskFilm, options?: { pushHistory?: boolean }) {
    const pushHistory = options?.pushHistory !== false;
    beginHistoryEntry(pushHistory);
    pendingWatchFilmIdRef.current = film.kinopoiskId;

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
    } finally {
      requestHistoryCommit(pushHistory);
    }
  }

  async function openCollection(id: string, options?: { pushHistory?: boolean }) {
    const collection = getCollectionById(id);

    if (!collection) {
      return;
    }

    const pushHistory = options?.pushHistory !== false;
    beginHistoryEntry(pushHistory);

    setCollectionId(id);
    setView("collection");
    setActiveMenu("Подборки");
    setCollectionStatus("loading");
    setCollectionFilms([]);

    try {
      const page =
        collection.source.kind === "top"
          ? await client.getTopFilms(collection.source.type, 1)
          : await client.getThemeFilms(collection.source.type, 1);
      setCollectionFilms(page.films);
      setCollectionStatus("success");
    } catch {
      setCollectionStatus("error");
    }

    requestHistoryCommit(pushHistory);
  }

  async function handleMenuClick(item: MenuItem, options?: { pushHistory?: boolean }) {
    const pushHistory = options?.pushHistory !== false;
    beginHistoryEntry(pushHistory);
    pendingWatchFilmIdRef.current = null;

    setActiveMenu(item);
    setSelectedFilm(null);
    setDetailsStatus("idle");
    setIsSearchOpen(false);

    try {
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
    } finally {
      requestHistoryCommit(pushHistory);
    }
  }

  async function goHome() {
    navHistoryRef.current = [];
    pendingWatchFilmIdRef.current = null;
    setView("catalog");
    setActiveMenu("Главная");
    setSelectedFilm(null);
    setDetailsStatus("idle");
    await loadCatalogPage({ mode: "premieres", nextPage: 1, replace: true });
    replaceAppHistory(captureSnapshot());
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
    setRecommendations(null);
    setRecommendationsStatus("idle");
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
        <button className="brand-mark" type="button" onClick={() => void goHome()}>
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
        <div className="topbar__actions">
          <UserMenu
            isAuthenticated={Boolean(authUser)}
            onLogin={() => void handleMenuClick("Профиль")}
            onProfile={() => void handleMenuClick("Профиль")}
            onLogout={() => void handleLogout()}
          />
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
        </div>
      </header>

      {error ? <p className="error-message">{error}</p> : null}

      {view === "catalog" ? (
        <section className="home-view" id="main">
          <div className="section-heading section-heading--home">
            <p className="eyebrow">{heading.eyebrow}</p>
            <h1>{heading.title}</h1>
            <p>{heading.text}</p>
          </div>

          {authUser && catalogMode === "premieres" && recommendationsStatus === "loading" ? (
            <div className="recommendations-shelf-skeleton" aria-label="Загрузка рекомендаций">
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="film-skeleton film-skeleton--shelf" />
              ))}
            </div>
          ) : null}

          {showRecommendations ? (
            <FilmShelf
              title={recommendationTitle}
              subtitle={recommendations?.reason}
              films={recommendationFilms}
              onSelect={(film) => void openFilm(film)}
            />
          ) : null}

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
            <FilmGrid films={visibleFilms} onSelect={(film) => void openFilm(film)} />
          ) : null}

          <div ref={loadMoreRef} className="load-more-sentinel" aria-live="polite">
            {isLoadingMore
              ? "Загружаем следующую подборку..."
              : hasMore
                ? `Листайте дальше · страница ${page} из ${totalPages}`
                : "Это всё на сейчас"}
            {hasMore && !isLoadingMore ? (
              <button type="button" className="load-more-button" onClick={() => void loadNextPage()}>
                Загрузить ещё
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {view === "collections" ? (
        <section className="collections-view" id="main">
          <div className="section-heading">
            <p className="eyebrow">collections</p>
            <h1>Подборки фильмов</h1>
            <p>
              Подборки подтягиваются с Кинопоиска через серверный кэш — один запрос на список,
              без лишней траты квоты API.
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
                <span className="collection-card__badge">Кинопоиск</span>
                <strong>{collection.title}</strong>
                <p>{collection.description}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {view === "collection" && activeCollection ? (
        <section className="collection-detail-view" id="main">
          <BackButton label={backLabel} onClick={() => void goBack()} />
          <div className="section-heading">
            <p className="eyebrow">collection</p>
            <h1>{activeCollection.title}</h1>
            <p>{activeCollection.description}</p>
          </div>
          {collectionStatus === "loading" ? <p className="player-status">Загружаем подборку...</p> : null}
          {collectionFilms.length > 0 ? (
            <FilmGrid films={collectionFilms} onSelect={(film) => void openFilm(film)} />
          ) : collectionStatus === "success" ? (
            <div className="empty-state">
              <strong>В подборке пока нет доступных карточек.</strong>
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "profile" ? (
        <section className="profile-view" id="main">
          {!authUser ? (
            <div className="profile-login-wrap">
              <form className="profile-login" onSubmit={handleLogin}>
                <h1>Вход</h1>
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
            </div>
          ) : (
            <div className="profile-shelves">
              {(["watching", "plan", "waiting", "watched"] as WatchStatus[]).map((statusKey) => {
                const items = userLists.filter((item) => item.status === statusKey);
                const films = items
                  .map((item) => listFilms[item.kinopoiskId])
                  .filter((film): film is KinopoiskFilm => Boolean(film));
                const showProgress = statusKey === "watching" || statusKey === "watched";

                return (
                  <FilmShelf
                    key={statusKey}
                    title={watchStatusLabels[statusKey]}
                    films={films}
                    progressByFilm={showProgress ? progressByFilm : undefined}
                    onSelect={(film) => void openFilm(film)}
                  />
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {view === "watch" ? (
        <section className="watch-page" id="main">
          <BackButton label={backLabel} onClick={() => void goBack()} />
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
                  progressPercent={selectedListEntry?.progressPercent}
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
                  trackProgress={Boolean(authUser)}
                  onPlaybackStarted={() => void markPlaybackStarted()}
                  onPlayerProgress={(progress) => reportPosition(progress)}
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

function countVisibleFilms(films: KinopoiskFilm[], mode: CatalogMode): number {
  if (mode === "search") {
    return films.length;
  }

  return films.filter((film) => hasValidPosterUrl(film.posterUrl)).length;
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
