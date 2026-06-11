import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

import { BackButton } from "./components/BackButton";
import { BrandMark } from "./components/BrandMark";
import { BrowseMenu } from "./components/BrowseMenu";
import { CursorGlow } from "./components/CursorGlow";
import { FilmGrid } from "./components/FilmGrid";
import { FilmShelf } from "./components/FilmShelf";
import { MoviePlayers } from "./components/MoviePlayers";
import { PosterImage } from "./components/PosterImage";
import { WatchDetailsPreloader } from "./components/WatchDetailsPreloader";
import { UserMenu } from "./components/UserMenu";
import { FavoriteToggle } from "./components/FavoriteToggle";
import { WatchListControls } from "./components/WatchListControls";
import { useWindowCatalogScroll } from "./hooks/useWindowCatalogScroll";
import { useWatchTracker } from "./hooks/useWatchTracker";
import { buildBrowseSections } from "./data/browseSections";
import { filmCollections, getCollectionById } from "./data/collections";
import type { BrowseMedia, CatalogFilter, KinopoiskFilters } from "./lib/catalogFilter";
import { getCatalogFilterMediaType } from "./lib/catalogFilter";
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
  countVisibleFilms,
  getAdaptiveSkeletonCount,
  mergeFilms,
  MIN_VISIBLE_BUFFER,
  shouldShowCatalogSkeletons
} from "./lib/catalogFeed";
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

const menuItems: MenuItem[] = ["Главная", "Фильмы", "Сериалы", "Каталог", "Профиль"];

const catalogHeadings: Record<
  Exclude<CatalogMode, "filtered">,
  { eyebrow: string; title: string; text: string }
> = {
  premieres: {
    eyebrow: "",
    title: "",
    text: ""
  },
  search: {
    eyebrow: "search results",
    title: "Результаты поиска",
    text: "Показываем первую страницу результатов. Уточните запрос, если нужен другой фильм."
  },
  films: {
    eyebrow: "films",
    title: "Фильмы",
    text: ""
  },
  serials: {
    eyebrow: "series",
    title: "Сериалы",
    text: ""
  }
};

export function App() {
  const [query, setQuery] = useState("");
  const [films, setFilms] = useState<KinopoiskFilm[]>([]);
  const [selectedFilm, setSelectedFilm] = useState<KinopoiskFilmDetails | null>(null);
  const [watchPreviewFilm, setWatchPreviewFilm] = useState<KinopoiskFilm | null>(null);
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
  const [selectedLists, setSelectedLists] = useState<WatchStatus[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [recommendationsStatus, setRecommendationsStatus] = useState<LoadState>("idle");
  const [similarFilms, setSimilarFilms] = useState<KinopoiskFilm[]>([]);
  const [similarFilmsStatus, setSimilarFilmsStatus] = useState<LoadState>("idle");
  const [browseMedia, setBrowseMedia] = useState<BrowseMedia>("films");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter | null>(null);
  const [kinopoiskFilters, setKinopoiskFilters] = useState<KinopoiskFilters | null>(null);
  const [filtersStatus, setFiltersStatus] = useState<LoadState>("idle");
  const isFetchingMoreRef = useRef(false);
  const pageRef = useRef(1);
  const filmsRef = useRef<KinopoiskFilm[]>([]);
  const hasMoreRef = useRef(hasMore);
  const catalogModeRef = useRef(catalogMode);
  const catalogFilterRef = useRef<CatalogFilter | null>(null);
  const queryRef = useRef(query);
  const navHistoryRef = useRef<NavigationSnapshot[]>([]);
  const pendingWatchFilmIdRef = useRef<number | null>(null);
  const [topbarScrolled, setTopbarScrolled] = useState(false);
  const isHistoryNavigationRef = useRef(false);
  const shouldCommitHistoryRef = useRef(false);
  queryRef.current = query;
  filmsRef.current = films;
  hasMoreRef.current = hasMore;
  catalogModeRef.current = catalogMode;
  catalogFilterRef.current = catalogFilter;

  const client = useMemo(() => createKinopoiskClient(), []);
  const browseSections = useMemo(() => {
    if (!kinopoiskFilters) {
      return [];
    }

    return buildBrowseSections(browseMedia, kinopoiskFilters);
  }, [browseMedia, kinopoiskFilters]);
  const players = selectedFilm ? createPlayerSources(selectedFilm, playerTemplates) : [];
  const visibleFilms = useMemo(
    () =>
      catalogMode === "search"
        ? films
        : films.filter((film) => hasValidPosterUrl(film.posterUrl)),
    [catalogMode, films]
  );
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
  const recommendationsPending =
    Boolean(authUser) &&
    catalogMode === "premieres" &&
    recommendationsStatus === "loading" &&
    recommendations === null;
  const showRecommendations =
    Boolean(authUser) && catalogMode === "premieres" && recommendationFilms.length > 0;
  const recommendationFilmIds = useMemo(
    () => new Set(recommendationFilms.map((film) => film.kinopoiskId)),
    [recommendationFilms]
  );
  const recommendationFilmIdsRef = useRef(recommendationFilmIds);
  recommendationFilmIdsRef.current = showRecommendations ? recommendationFilmIds : new Set<number>();
  const catalogGridFilms = useMemo(() => {
    if (recommendationFilmIds.size === 0) {
      return visibleFilms;
    }

    return visibleFilms.filter((film) => !recommendationFilmIds.has(film.kinopoiskId));
  }, [recommendationFilmIds, visibleFilms]);
  const visibleSimilarFilms = useMemo(
    () => similarFilms.filter((film) => hasValidPosterUrl(film.posterUrl)),
    [similarFilms]
  );
  const [catalogSkeletonCount, setCatalogSkeletonCount] = useState(() => getAdaptiveSkeletonCount());

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
    document.title = "Сеанс — фильмы и сериалы";
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setTopbarScrolled(window.scrollY > 36);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
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

  useEffect(() => {
    if (view !== "watch" || !selectedFilm) {
      setSimilarFilms([]);
      setSimilarFilmsStatus("idle");
      return;
    }

    let cancelled = false;
    setSimilarFilmsStatus("loading");

    void client.getSimilarFilms(selectedFilm.kinopoiskId).then(
      (films) => {
        if (!cancelled) {
          setSimilarFilms(films ?? []);
          setSimilarFilmsStatus("success");
        }
      },
      () => {
        if (!cancelled) {
          setSimilarFilms([]);
          setSimilarFilmsStatus("error");
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [client, selectedFilm, view]);

  const handleWatchTrackerStatusChange = useCallback(
    (status: WatchStatus) => {
      setSelectedLists((current) => (current.includes(status) ? current : [...current, status]));
      void refreshUserLists();
    },
    [refreshUserLists]
  );

  const playbackStatus = resolvePlaybackStatus(selectedLists);

  const { markPlaybackStarted, reportPosition } = useWatchTracker({
    enabled: Boolean(authUser && view === "watch" && selectedFilm),
    kinopoiskId: selectedFilm?.kinopoiskId,
    filmLengthMinutes: selectedFilm?.filmLengthMinutes,
    currentStatus: playbackStatus,
    onStatusChange: handleWatchTrackerStatusChange
  });

  const captureSnapshotRef = useRef<() => NavigationSnapshot>(() => ({
    view: "catalog",
    activeMenu: "Главная",
    catalogMode: "premieres",
    collectionId: null,
    filmId: null,
    searchQuery: "",
    scrollY: 0
  }));

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
      browseMedia,
      catalogFilter: catalogMode === "filtered" ? catalogFilter : null,
      scrollY: window.scrollY
    };
  }, [activeMenu, browseMedia, catalogFilter, catalogMode, collectionId, query, selectedFilm, view]);

  captureSnapshotRef.current = captureSnapshot;

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
        setSelectedLists(
          userLists.find((item) => item.kinopoiskId === snapshot.filmId)?.lists ?? []
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
      } else if (snapshot.view === "browse") {
        setView("browse");
        setSelectedFilm(null);
        setDetailsStatus("idle");
        setBrowseMedia(snapshot.browseMedia ?? "films");
        setFiltersStatus(kinopoiskFilters ? "success" : "idle");
        if (!kinopoiskFilters) {
          try {
            setFiltersStatus("loading");
            const filters = await client.getFilters();
            setKinopoiskFilters(filters);
            setFiltersStatus("success");
          } catch (filtersError) {
            setError(getErrorMessage(filtersError));
            setFiltersStatus("error");
          }
        }
      } else {
        setView("catalog");
        setSelectedFilm(null);
        setDetailsStatus("idle");

        if (snapshot.catalogMode === "filtered" && snapshot.catalogFilter) {
          setCatalogFilter(snapshot.catalogFilter);
          catalogFilterRef.current = snapshot.catalogFilter;
          setStatus("loading");
          setError(null);

          try {
            const page = await fetchCatalogPage(client, "filtered", 1, "", snapshot.catalogFilter);
            setFilms(page.films);
            filmsRef.current = page.films;
            setPage(page.page);
            setTotalPages(page.totalPages);
            setHasMore(page.page < page.totalPages);
            hasMoreRef.current = page.page < page.totalPages;
            setStatus("success");
          } catch (filteredError) {
            setError(getErrorMessage(filteredError));
            setStatus("error");
          }
        } else if (snapshot.catalogMode === "search" && snapshot.searchQuery) {
          setQuery(snapshot.searchQuery);
          setStatus("loading");
          setError(null);

          try {
            const page = await client.searchFilms(snapshot.searchQuery, 1);
            setFilms(page.films);
            filmsRef.current = page.films;
            setPage(page.page);
            pageRef.current = page.page;
            setHasMore(false);
            hasMoreRef.current = false;
            setStatus("success");
          } catch (searchError) {
            setError(getErrorMessage(searchError));
            setStatus("error");
          }
        } else if (
          snapshot.catalogMode === "premieres" ||
          snapshot.catalogMode === "films" ||
          snapshot.catalogMode === "serials"
        ) {
          setCatalogFilter(null);
          catalogFilterRef.current = null;
          setStatus("loading");
          setError(null);

          try {
            const page = await fetchCatalogPage(client, snapshot.catalogMode, 1, "", null);
            setFilms(page.films);
            filmsRef.current = page.films;
            setPage(page.page);
            pageRef.current = page.page;
            setTotalPages(page.totalPages);
            const nextHasMore = page.page < page.totalPages;
            setHasMore(nextHasMore);
            hasMoreRef.current = nextHasMore;
            setStatus("success");
          } catch (catalogError) {
            setError(getErrorMessage(catalogError));
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
    const snapshot = navHistoryRef.current.pop();
    if (!snapshot) {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      setView("catalog");
      setActiveMenu("Главная");
      setSelectedFilm(null);
      setWatchPreviewFilm(null);
      setDetailsStatus("idle");
      replaceAppHistory(captureSnapshotRef.current());
      return;
    }

    isHistoryNavigationRef.current = true;
    void restoreSnapshot(snapshot);

    if (window.history.length > 1) {
      window.history.back();
    }

    requestAnimationFrame(() => {
      isHistoryNavigationRef.current = false;
    });
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
    pushAppHistory(captureSnapshotRef.current());
  }, [view, activeMenu, catalogMode, collectionId, catalogFilter, browseMedia]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (isHistoryNavigationRef.current) {
        return;
      }

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

  const loadKinopoiskFilters = useCallback(async () => {
    if (kinopoiskFilters) {
      setFiltersStatus("success");
      return kinopoiskFilters;
    }

    setFiltersStatus("loading");
    setError(null);

    try {
      const filters = await client.getFilters();
      setKinopoiskFilters(filters);
      setFiltersStatus("success");
      return filters;
    } catch (filtersError) {
      setFiltersStatus("error");
      setError(getErrorMessage(filtersError));
      return null;
    }
  }, [client, kinopoiskFilters]);

  const loadCatalogPage = useCallback(
    async ({
      mode,
      nextPage,
      replace,
      filter
    }: {
      mode: CatalogMode;
      nextPage: number;
      replace: boolean;
      filter?: CatalogFilter | null;
    }) => {
      if (replace) {
        setStatus("loading");
      } else {
        setIsLoadingMore(true);
        isFetchingMoreRef.current = true;
      }

      setError(null);

      const appendPage = async (pageNumber: number, reset: boolean) => {
        const activeFilter = filter ?? catalogFilterRef.current;
        const catalogPage = await fetchCatalogPage(
          client,
          mode,
          pageNumber,
          queryRef.current,
          activeFilter
        );
        const merged = reset ? catalogPage.films : mergeFilms(filmsRef.current, catalogPage.films);

        setFilms(merged);
        filmsRef.current = merged;
        setPage(catalogPage.page);
        pageRef.current = catalogPage.page;
        setTotalPages(catalogPage.totalPages);
        setCatalogMode(mode);
        catalogModeRef.current = mode;
        const nextHasMore = mode === "search" ? false : catalogPage.page < catalogPage.totalPages;
        setHasMore(nextHasMore);
        hasMoreRef.current = nextHasMore;

        return catalogPage;
      };

      try {
        await appendPage(nextPage, replace);
        setStatus("success");
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        if (replace) {
          setStatus("error");
          setHasMore(false);
          hasMoreRef.current = false;
        }
      } finally {
        setIsLoadingMore(false);
        isFetchingMoreRef.current = false;
      }
    },
    [client]
  );

  const loadNextPage = useCallback(async () => {
    if (
      catalogModeRef.current === "search" ||
      !hasMoreRef.current ||
      isFetchingMoreRef.current
    ) {
      return;
    }

    await loadCatalogPage({
      mode: catalogModeRef.current,
      nextPage: pageRef.current + 1,
      replace: false,
      filter: catalogFilterRef.current
    });
  }, [loadCatalogPage]);

  const loadNextPageRef = useRef(loadNextPage);
  loadNextPageRef.current = loadNextPage;

  useEffect(() => {
    void loadCatalogPage({ mode: "premieres", nextPage: 1, replace: true });
  }, [loadCatalogPage]);

  const { nearEnd: catalogNearEnd, hasUserScrolled: catalogHasUserScrolled } =
    useWindowCatalogScroll({
      enabled: view === "catalog",
      catalogMode,
      hasMore,
      isLoadingMore,
      onLoadMore: () => void loadNextPageRef.current()
    });

  const showCatalogSkeletons = shouldShowCatalogSkeletons({
    catalogMode,
    hasMore,
    isLoadingMore,
    nearEnd: catalogNearEnd,
    hasUserScrolled: catalogHasUserScrolled
  });

  useEffect(() => {
    const syncSkeletonCount = () => {
      setCatalogSkeletonCount(getAdaptiveSkeletonCount());
    };

    syncSkeletonCount();
    window.addEventListener("resize", syncSkeletonCount, { passive: true });
    return () => window.removeEventListener("resize", syncSkeletonCount);
  }, []);

  useEffect(() => {
    if (view !== "catalog" || catalogMode !== "premieres" || recommendationsPending) {
      return;
    }

    if (!hasMoreRef.current || isFetchingMoreRef.current) {
      return;
    }

    const visible = countVisibleFilms(filmsRef.current, "premieres", recommendationFilmIds);
    if (visible >= MIN_VISIBLE_BUFFER) {
      return;
    }

    void loadCatalogPage({
      mode: "premieres",
      nextPage: pageRef.current + 1,
      replace: false,
      filter: null
    });
  }, [catalogMode, loadCatalogPage, recommendationFilmIds, recommendationsPending, view]);

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
    setWatchPreviewFilm(film);
    setSelectedFilm(null);
    setDetailsStatus("loading");
    setView("watch");
    setSelectedLists(
      userLists.find((item) => item.kinopoiskId === film.kinopoiskId)?.lists ?? []
    );
    requestHistoryCommit(pushHistory);

    try {
      const details = await client.getFilm(film.kinopoiskId);
      setSelectedFilm(details);
      setWatchPreviewFilm(null);
      setDetailsStatus("success");
    } catch (detailsError) {
      setError(getErrorMessage(detailsError));
      setWatchPreviewFilm(null);
      setDetailsStatus("error");
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
    setActiveMenu("Каталог");
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
    setWatchPreviewFilm(null);
    setDetailsStatus("idle");
    setIsSearchOpen(false);

    try {
      if (item === "Профиль") {
        setView("profile");
        if (authUser) {
          await refreshUserLists();
        }
        return;
      }

      if (item === "Каталог") {
        await openBrowse(browseMedia, { pushHistory, activeMenu: "Каталог" });
        return;
      }

      setCatalogFilter(null);
      catalogFilterRef.current = null;
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

  async function openBrowse(
    media: BrowseMedia,
    options?: { pushHistory?: boolean; activeMenu?: MenuItem }
  ) {
    const pushHistory = options?.pushHistory !== false;
    beginHistoryEntry(pushHistory);
    pendingWatchFilmIdRef.current = null;
    setBrowseMedia(media);
    setView("browse");
    setActiveMenu(options?.activeMenu ?? (media === "serials" ? "Сериалы" : "Фильмы"));
    setSelectedFilm(null);
    setWatchPreviewFilm(null);
    setDetailsStatus("idle");
    setIsSearchOpen(false);
    await loadKinopoiskFilters();
    requestHistoryCommit(pushHistory);
  }

  async function openFilteredCatalog(filter: CatalogFilter, options?: { pushHistory?: boolean }) {
    const pushHistory = options?.pushHistory !== false;
    beginHistoryEntry(pushHistory);
    pendingWatchFilmIdRef.current = null;
    setCatalogFilter(filter);
    catalogFilterRef.current = filter;
    setView("catalog");
    setActiveMenu(filter.media === "serials" ? "Сериалы" : "Фильмы");
    setCatalogMode("filtered");
    catalogModeRef.current = "filtered";
    setSelectedFilm(null);
    setWatchPreviewFilm(null);
    setDetailsStatus("idle");
    setIsSearchOpen(false);
    await loadCatalogPage({ mode: "filtered", nextPage: 1, replace: true, filter });
    requestHistoryCommit(pushHistory);
  }

  async function goHome() {
    navHistoryRef.current = [];
    pendingWatchFilmIdRef.current = null;
    setCatalogFilter(null);
    catalogFilterRef.current = null;
    setView("catalog");
    setActiveMenu("Главная");
    setSelectedFilm(null);
    setWatchPreviewFilm(null);
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
    setSelectedLists([]);
    setRecommendations(null);
    setRecommendationsStatus("idle");
  }

  const heading =
    catalogMode === "filtered" && catalogFilter
      ? {
          eyebrow: "",
          title: catalogFilter.title,
          text: ""
        }
      : catalogHeadings[catalogMode as Exclude<CatalogMode, "filtered">];
  const showCatalogHeading = Boolean(heading.eyebrow || heading.title || heading.text);

  return (
    <>
      <CursorGlow />
      <main className="app-shell">
        <div className="ambient ambient-left" aria-hidden="true" />
        <div className="ambient ambient-right" aria-hidden="true" />

        <header
          className={`topbar${isSearchOpen ? " topbar--search-active" : ""}${topbarScrolled ? " topbar--scrolled" : ""}`}
          aria-label="Навигация"
        >
          <BrandMark onClick={() => void goHome()} />
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

        <div key={view} className="page-stage page-stage--enter">
      {view === "catalog" ? (
        <section className="home-view" id="main">
          {showCatalogHeading ? (
            <div className="section-heading section-heading--home">
              {heading.eyebrow ? <p className="eyebrow">{heading.eyebrow}</p> : null}
              {heading.title ? <h1>{heading.title}</h1> : null}
              {heading.text ? <p>{heading.text}</p> : null}
            </div>
          ) : null}

          {recommendationsPending ? (
            <div className="recommendations-shelf-skeleton" aria-label="Загрузка рекомендаций">
              <span className="recommendations-shelf-skeleton__head" />
              <div className="recommendations-shelf-skeleton__track">
                {Array.from({ length: 6 }).map((_, index) => (
                  <span key={index} className="film-skeleton film-skeleton--shelf" />
                ))}
              </div>
            </div>
          ) : null}

          {showRecommendations ? (
            <aside className="recommendations-rail" aria-label="Рекомендации">
              <FilmShelf
                title={recommendationTitle}
                subtitle={recommendations?.reason}
                films={recommendationFilms}
                onSelect={(film) => void openFilm(film)}
              />
            </aside>
          ) : null}

          {!recommendationsPending && status === "loading" ? (
            <div className="skeleton-grid" aria-label="Загрузка результатов">
              {Array.from({ length: 10 }).map((_, index) => (
                <span key={index} className="film-skeleton" />
              ))}
            </div>
          ) : null}

          {!recommendationsPending && visibleFilms.length === 0 && status !== "loading" ? (
            <div className="empty-state empty-state--composed">
              <span className="empty-state__marker">01</span>
              <strong>Пока ничего не найдено.</strong>
              <p>Откройте поиск сверху и попробуйте другой запрос.</p>
            </div>
          ) : null}

          {!recommendationsPending &&
          (catalogGridFilms.length > 0 || showCatalogSkeletons) ? (
            <div
              className={`catalog-feed${showCatalogSkeletons ? " catalog-feed--loading" : ""}`}
            >
              <FilmGrid
                films={catalogGridFilms}
                animate={status === "success" && !showCatalogSkeletons}
                loadingSkeletonCount={showCatalogSkeletons ? catalogSkeletonCount : 0}
                onSelect={(film) => void openFilm(film)}
              />
            </div>
          ) : null}

          {catalogMode !== "search" && !recommendationsPending ? (
            <div className="catalog-feed-footer" aria-live="polite">
              {showCatalogSkeletons ? (
                <div className="catalog-feed-footer__loading" role="status">
                  <span className="catalog-feed-footer__progress" aria-hidden="true">
                    <span className="catalog-feed-footer__progress-bar" />
                  </span>
                  <p className="catalog-feed-footer__status">Подгружаем фильмы...</p>
                </div>
              ) : null}
              {!showCatalogSkeletons && hasMore && catalogGridFilms.length > 0 ? (
                <button
                  type="button"
                  className="load-more-button"
                  onClick={() => void loadNextPageRef.current()}
                >
                  Загрузить ещё
                </button>
              ) : null}
              {!showCatalogSkeletons && !hasMore && catalogGridFilms.length > 0 ? (
                <p className="catalog-feed-footer__status">Это всё на сейчас</p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {view === "browse" ? (
        <BrowseMenu
          media={browseMedia}
          sections={browseSections}
          isLoading={filtersStatus === "loading"}
          error={filtersStatus === "error" ? error : null}
          onMediaChange={setBrowseMedia}
          onRetry={() => void loadKinopoiskFilters()}
          onSelect={(filter) => void openFilteredCatalog(filter)}
        />
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
              {(["favorite", "watching", "plan", "waiting", "watched"] as WatchStatus[]).map(
                (statusKey) => {
                  const items = userLists.filter((item) => item.lists.includes(statusKey));
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
                }
              )}
            </div>
          )}
        </section>
      ) : null}

      {view === "watch" ? (
        <section className="watch-page" id="main">
          <div className="watch-page__toolbar">
            <BackButton label={backLabel} onClick={() => void goBack()} />
            {selectedFilm ? (
              <WatchListControls
                kinopoiskId={selectedFilm.kinopoiskId}
                activeLists={selectedLists}
                progressPercent={selectedListEntry?.progressPercent}
                isAuthenticated={Boolean(authUser)}
                onListsChange={(lists) => {
                  setSelectedLists(lists);
                  if (authUser) {
                    void refreshUserLists();
                  }
                }}
              />
            ) : null}
          </div>
          {detailsStatus === "loading" ? <WatchDetailsPreloader film={watchPreviewFilm} /> : null}
          {selectedFilm ? (
            <article
              className="watch-hero watch-hero--parallax"
              style={
                selectedFilm.posterUrl
                  ? ({ "--watch-poster": `url(${selectedFilm.posterUrl})` } as CSSProperties)
                  : undefined
              }
            >
              <header className="watch-hero__identity">
                {selectedFilm.posterUrl ? (
                  <PosterImage
                    className="watch-hero__poster"
                    src={selectedFilm.posterUrl}
                    alt={`Постер ${selectedFilm.title}`}
                    loading="eager"
                  />
                ) : null}
                <div className="watch-hero__copy">
                  <p className="watch-hero__eyebrow">Сейчас смотрите</p>
                  <h1 className="watch-hero__title">
                    <span>{selectedFilm.title}</span>
                    <FavoriteToggle
                      kinopoiskId={selectedFilm.kinopoiskId}
                      isFavorite={selectedLists.includes("favorite")}
                      isAuthenticated={Boolean(authUser)}
                      onChange={(isFavorite) => {
                        setSelectedLists((current) => {
                          if (isFavorite) {
                            return current.includes("favorite") ? current : [...current, "favorite"];
                          }

                          return current.filter((status) => status !== "favorite");
                        });
                        if (authUser) {
                          void refreshUserLists();
                        }
                      }}
                    />
                  </h1>
                  <p className="watch-hero__facts">
                    {[
                      selectedFilm.year,
                      selectedFilm.rating && `КП ${selectedFilm.rating}`,
                      selectedFilm.imdbRating && `IMDb ${selectedFilm.imdbRating}`,
                      selectedFilm.originalTitle
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {selectedFilm.genres && selectedFilm.genres.length > 0 ? (
                    <div className="watch-hero__genres" aria-label="Жанры">
                      {selectedFilm.genres.map((genre) => (
                        <span key={genre} className="watch-hero__genre">
                          {genre}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selectedFilm.description ? (
                    <p className="watch-hero__description">{selectedFilm.description}</p>
                  ) : detailsStatus === "success" ? (
                    <p className="watch-hero__description watch-hero__description--empty">
                      Описание пока недоступно.
                    </p>
                  ) : null}
                </div>
              </header>

              <div className="watch-hero__stage">
                <MoviePlayers
                  players={players}
                  resolveOptions={{ allohaToken, hdvbToken, embedDomain }}
                  trackProgress={Boolean(authUser)}
                  onPlaybackStarted={() => void markPlaybackStarted()}
                  onPlayerProgress={(progress) => reportPosition(progress)}
                />
                {players.length === 0 ? (
                  <p className="hint watch-hero__hint">
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
          {similarFilmsStatus === "loading" ? (
            <p className="player-status watch-page__similars-status">Загружаем похожие...</p>
          ) : null}
          {visibleSimilarFilms.length > 0 ? (
            <FilmShelf
              title="Похожие"
              subtitle="По данным Кинопоиска, отсортировано по рейтингу"
              films={visibleSimilarFilms}
              onSelect={(film) => void openFilm(film)}
            />
          ) : null}
        </section>
      ) : null}
        </div>
      </main>
    </>
  );
}

async function fetchCatalogPage(
  client: ReturnType<typeof createKinopoiskClient>,
  mode: CatalogMode,
  nextPage: number,
  keyword: string,
  filter?: CatalogFilter | null
) {
  if (mode === "search") {
    return client.searchFilms(keyword, nextPage);
  }

  if (mode === "filtered" && filter) {
    if (filter.kind === "theme" && filter.themeType) {
      return client.getThemeFilms(filter.themeType, nextPage);
    }

    if (filter.kind === "top" && filter.topType) {
      return client.getTopFilms(filter.topType, nextPage);
    }

    return client.getFilteredFilms(
      {
        type: getCatalogFilterMediaType(filter),
        genreId: filter.genreId,
        countryId: filter.countryId,
        year: filter.year,
        order: "NUM_VOTE"
      },
      nextPage
    );
  }

  if (mode === "premieres") {
    return client.getTopFilms("TOP_100_POPULAR_FILMS", nextPage);
  }

  if (mode === "films") {
    return client.getThemeFilms("TOP_POPULAR_MOVIES", nextPage);
  }

  return client.getRecentFilms(nextPage, "TV_SERIES");
}

function resolvePlaybackStatus(lists: WatchStatus[]): WatchStatus | null {
  if (lists.includes("watched")) {
    return "watched";
  }

  if (lists.includes("watching")) {
    return "watching";
  }

  return null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Что-то пошло не так";
}
