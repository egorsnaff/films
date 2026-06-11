# Пагинация каталога

Как устроена бесконечная прокрутка каталога в проекте `films` (прод: https://films.qzz.io).

---

## Общая идея

Пагинация **двухуровневая**:

1. **Сервер** — собирает «толстую» порцию из Kinopoisk (до 24 фильмов с постерами), возможно из нескольких сырых страниц API.
2. **Клиент** — хранит накопленный список, догружает по скроллу, показывает скелетоны и кнопку «Загрузить ещё».

Раньше клиент сам догонял пустые страницы Kinopoisk (auto-chase + `IntersectionObserver`). Сейчас это убрано: буферизация на сервере, на клиенте — scroll-based prefetch.

---

## Схема потока данных

```
Пользователь скроллит вниз
        ↓
useWindowCatalogScroll → shouldPrefetchByScroll()
        ↓
loadNextPage() в App.tsx
        ↓
fetchCatalogPage() → kinopoisk.ts → GET /api/kp/...
        ↓
server/index.ts → kinopoiskProxy.ts → bufferCatalogPage()
        ↓
Kinopoisk API (параллельно до 4 страниц за раз)
        ↓
{ films[], page, totalPages } → mergeFilms() → обновление сетки
```

---

## Файлы

### Клиент (React)

| Файл | Роль |
|------|------|
| `src/App.tsx` | Главная логика: state, `loadCatalogPage`, `loadNextPage`, рендер сетки и футера |
| `src/hooks/useWindowCatalogScroll.ts` | Слушает `scroll`/`resize`, определяет «близко к низу», триггерит догрузку |
| `src/lib/catalogFeed.ts` | Утилиты: merge, подсчёт видимых, prefetch-порог, скелетоны |
| `src/lib/kinopoisk.ts` | HTTP-клиент к `/api/kp/*`, локальный кэш в `localStorage` |
| `src/lib/navigation.ts` | Тип `CatalogMode` |
| `src/components/FilmGrid.tsx` | Сетка фильмов + inline-скелетоны в конце |
| `src/styles.css` | `.catalog-feed`, `.catalog-feed-footer`, прогресс-бар, кнопка «Загрузить ещё» |

### Сервер (Node/Express)

| Файл | Роль |
|------|------|
| `server/src/index.ts` | Роуты `/kp/top`, `/kp/collections`, `/kp/catalog/recent`, `/kp/catalog/filter` |
| `server/src/kinopoiskProxy.ts` | Запросы к Kinopoisk, `bufferCatalogPage`, `mapCatalogPage`, `resolveTotalPages` |
| `server/src/kpCache.ts` | Серверный кэш ответов Kinopoisk |

### Тесты

| Файл | Что проверяет |
|------|---------------|
| `src/lib/catalogFeed.test.ts` | merge, prefetch, скелетоны |
| `server/src/kinopoiskProxy.test.ts` | `bufferCatalogPage`, `resolveCatalogTotalPages` |
| `src/App.test.tsx` | Интеграция UI (кнопка «Загрузить ещё», рендер ленты) |

### Удалено (история)

- `src/hooks/useCatalogInfiniteScroll.ts` — `IntersectionObserver` + sentinel (больше не используется)

---

## Режимы каталога (`CatalogMode`)

Определены в `src/lib/navigation.ts`:

| Режим | Где включается | API-источник |
|-------|----------------|--------------|
| `premieres` | Главная (по умолчанию) | `TOP_100_POPULAR_FILMS` |
| `films` | Пункт меню «Фильмы» | `TOP_POPULAR_MOVIES` |
| `serials` | Пункт меню «Сериалы» | `getRecentFilms(TV_SERIES)` |
| `filtered` | Каталог → фильтр жанра/страны/года | `/kp/catalog/filter` |
| `search` | Поиск | `/kp/search` (без пагинации) |

Маршрутизация запросов — функция `fetchCatalogPage()` в конце `src/App.tsx`.

---

## State на клиенте

В `App.tsx` для пагинации:

```ts
films          // все загруженные фильмы (сырой массив)
page           // последняя «потреблённая» страница Kinopoisk (с сервера)
totalPages     // сколько страниц доступно у источника
hasMore        // page < totalPages (кроме search)
isLoadingMore  // идёт догрузка (не первая загрузка)
```

Дублируются в ref для колбэков без stale closure:

- `pageRef`, `filmsRef`, `hasMoreRef`, `isFetchingMoreRef`
- `catalogModeRef`, `catalogFilterRef`, `recommendationFilmIdsRef`

---

## Загрузка страниц

### Первая загрузка

```ts
useEffect(() => {
  void loadCatalogPage({ mode: "premieres", nextPage: 1, replace: true });
}, [loadCatalogPage]);
```

`replace: true` → полная замена `films`, статус `loading`, скелетон-сетка на весь экран.

### Догрузка (`loadNextPage`)

1. Проверки: не `search`, `hasMore`, не идёт другой fetch.
2. Вызов `loadCatalogPage({ nextPage: pageRef.current + 1, replace: false })`.
3. `mergeFilms()` добавляет новые фильмы без дублей по `kinopoiskId`.
4. `hasMore = catalogPage.page < catalogPage.totalPages`.

### Триггеры догрузки

1. **Скролл** — `useWindowCatalogScroll` (основной).
2. **Кнопка** — «Загрузить ещё» в футере.
3. **Автодогрузка на главной** — если после рекомендаций видимых фильмов < `MIN_VISIBLE_BUFFER` (12), догружается без скролла.

---

## Серверная буферизация

Ключевая функция — `bufferCatalogPage()` в `server/src/kinopoiskProxy.ts`.

### Зачем

Kinopoisk отдаёт ~20 фильмов на страницу, но часть без постеров. Если отдавать как есть, после прокрутки сетка «заканчивается», хотя страницы ещё есть.

### Как работает

Константы:

- `BUFFERED_CATALOG_MIN_FILMS = 24` — цель на один клиентский запрос
- `BUFFERED_CATALOG_MAX_FETCHES = 10` — максимум сырых страниц Kinopoisk
- `batchSize = 4` — параллельных запросов за раз

Алгоритм:

1. Старт с `startPage` (из query `?page=N`).
2. Параллельно запросить до 4 страниц Kinopoisk.
3. Оставить только фильмы с постером (`hasDisplayablePoster`).
4. Повторять, пока не наберётся 24 фильма или не кончатся страницы.
5. Вернуть `{ films, page: lastConsumedPage, totalPages }`.

### Где применяется

Буферизация включена для:

- `getTopList()` — главная, топы
- `getRecentCatalog()` — сериалы
- `getThemeList()` — подборки/коллекции
- `getFilterCatalog()` — фильтры каталога

**Не буферизуется:** `searchCatalog()` — поиск одноразовый, `hasMore = false`.

### Кэш

- Сырые страницы: `top:TYPE:1`, `theme:TYPE:2` и т.д.
- Буферизованный ответ: `top:TYPE:buffered:v2:1` (суффикс `v2` — после фикса стартовой страницы > 1)

Повторный запрос той же «логической» страницы идёт из кэша.

---

## Подсчёт `totalPages`

`resolveTotalPages()` в `kinopoiskProxy.ts`:

1. Явное `totalPages` / `pagesCount` из ответа Kinopoisk.
2. Иначе `ceil(total / itemCount)`.
3. Иначе эвристика: полная страница (≥20) → `page + 1`, частичная → текущая последняя.

Клиент: `hasMore = page < totalPages`.

---

## Фильтрация видимых фильмов

Два уровня:

### 1. Сервер

`normalizePosterUrl()` — отбрасывает URL с `no-poster`.

### 2. Клиент

`hasValidPosterUrl()` в `kinopoisk.ts` — та же логика.

Производные списки в `App.tsx`:

```ts
visibleFilms      // films с валидным постером (кроме search)
catalogGridFilms  // visibleFilms минус блок рекомендаций на главной
```

На главной у авторизованного пользователя рекомендации показываются в `FilmShelf` сверху, а из основной сетки эти ID **вычитаются** — иначе дубли и «пустая» сетка при большом блоке рекомендаций.

---

## Scroll-prefetch (клиент)

`src/hooks/useWindowCatalogScroll.ts`:

| Параметр | Значение |
|----------|----------|
| Порог prefetch | `max(900px, 1.25 × высота экрана)` |
| `nearEnd` | расстояние до низа < порога |
| Дебаунс | `requestAnimationFrame` на scroll/resize |

При `nearEnd && hasMore && !isLoadingMore` → `loadNextPage()`. Повторная догрузка сразу после завершения предыдущей **отключена** — нужен новый scroll-событие или кнопка «Загрузить ещё». Между запросами действует cooldown `MIN_CATALOG_LOAD_INTERVAL_MS`.

---

## UI при догрузке

### Скелетоны

`shouldShowCatalogSkeletons()` в `catalogFeed.ts`:

```
показывать, если:
  режим ≠ search
  AND hasMore
  AND (
    isLoadingMore
    OR (nearEnd AND лента выше viewport)
  )
```

Скелетоны **в той же** `film-grid` (не отдельной строкой). Количество: `getAdaptiveSkeletonCount()` — 3 ряда по ширине экрана, минимум 12.

### Футер

| Состояние | UI |
|-----------|-----|
| Идёт догрузка / скролл к низу | Прогресс-бар + «Подгружаем фильмы...» |
| Есть ещё страницы | Кнопка «Загрузить ещё» |
| Конец ленты | «Это всё на сейчас» |

CSS: `.catalog-feed`, `.catalog-feed--loading`, `.catalog-feed-footer__*`.

---

## Константы

### Клиент (`src/lib/catalogFeed.ts`)

| Константа | Значение | Назначение |
|-----------|----------|------------|
| `MIN_VISIBLE_BUFFER` | 12 | Минимум видимых на главной до автодогрузки |
| `SCROLL_PREFETCH_VIEWPORTS` | 1.25 | Множитель высоты экрана для prefetch |
| `MIN_SCROLL_PREFETCH_PX` | 900 | Нижняя граница prefetch |
| `MIN_CATALOG_LOAD_INTERVAL_MS` | 450 | Минимальный интервал между догрузками |
| `MAX_AUTO_BUFFER_LOADS` | 4 | Лимит автодогрузок на главной без скролла |
| `SKELETON_ROWS` | 3 | Рядов скелетонов |
| `MIN_LOAD_MORE_SKELETON_COUNT` | 12 | Минимум скелетонов |

### Сервер (`server/src/kinopoiskProxy.ts`)

| Константа | Значение | Назначение |
|-----------|----------|------------|
| `BUFFERED_CATALOG_MIN_FILMS` | 24 | Целевой размер порции |
| `BUFFERED_CATALOG_MAX_FETCHES` | 10 | Лимит сырых страниц Kinopoisk |
| `CATALOG_PAGE_SIZE` | 20 | Размер страницы Kinopoisk (для эвристики totalPages) |

---

## API-эндпоинты

Все под префиксом `/api/kp/` (проксируются через `kinopoisk.ts`):

```
GET /kp/top?type=TOP_100_POPULAR_FILMS&page=1
GET /kp/collections?type=TOP_POPULAR_MOVIES&page=1
GET /kp/catalog/recent?type=TV_SERIES&page=1
GET /kp/catalog/filter?type=FILM&genreId=...&page=1
GET /kp/search?keyword=...&page=1
```

Ответ:

```ts
{
  page: {
    films: KinopoiskFilm[],
    page: number,      // последняя потреблённая страница Kinopoisk
    totalPages: number
  },
  fromCache: boolean
}
```

Клиент берёт только `result.page`.

---

## Кэширование (два уровня)

1. **Сервер** (`kpCache.ts`) — SQLite/файл, TTL по типу (`catalog`, `list`, `search`).
2. **Клиент** (`kpLocalCache.ts`) — `localStorage`, ключи вида `v2:top:TOP_100_POPULAR_FILMS:1`.

Клиент кэширует **логический** запрос (`page=N`), сервер внутри может сходить в Kinopoisk на страницы N…N+3. Пустые/битые ответы (артефакт старой буферизации) **не читаются и не пишутся** в кэш — см. `catalogPage.ts`.

---

## Особые случаи

### Поиск (`search`)

- Одна «страница» результатов, `hasMore = false`.
- Пагинация и скелетоны догрузки отключены.

### Рекомендации на главной

- Пока `recommendationsPending` — основная сетка скрыта, показывается скелетон полки рекомендаций.
- После загрузки — полка сверху, сетка без дублей.
- Если видимых в сетке < 12 — автодогрузка без скролла.

### Навигация назад

`restoreSnapshot()` в `App.tsx` восстанавливает `films`, `page`, `hasMore` из истории браузера — пагинация не сбрасывается при возврате.

### Ошибка при догрузке

При `replace: false` ошибка не обнуляет ленту — остаются уже загруженные фильмы, `hasMore` не меняется.

---

## Известные ограничения

1. **Задержка первого cold-запроса** — буферизация может занять 1–5 с (параллельные запросы к Kinopoisk). Скелетоны должны покрывать это время.
2. **`page` на клиенте ≠ номер «порции»** — это последняя сырая страница Kinopoisk, которую съел сервер. Пропуски в нумерации нормальны.
3. **Рекомендации уменьшают видимую сетку** — на главной часть фильмов уходит в полку, сетка может казаться короче.
4. **Поиск без пагинации** — при большом числе результатов всё на одной странице.

---

## Как отладить

1. **Network** — `GET /api/kp/top?page=N`, смотреть размер `films[]` и поля `page` / `totalPages`.
2. **Сервер** — `GET /health/kp/stats` (счётчик запросов Kinopoisk).
3. **Клиент** — React DevTools: `films.length`, `page`, `hasMore`, `isLoadingMore`, `catalogNearEnd`.
4. **Тесты** — `npm test` и `cd server && npm test`.

---

## Чеклист при изменениях

- [ ] Меняется логика merge → `catalogFeed.ts` + тесты
- [ ] Меняется prefetch/скелетоны → `useWindowCatalogScroll.ts`, `catalogFeed.ts`, `App.tsx`
- [ ] Меняется размер порции → `BUFFERED_CATALOG_MIN_FILMS` на сервере
- [ ] Новый режим каталога → `fetchCatalogPage()` + `CatalogMode` + серверный endpoint
- [ ] Меняется UI загрузки → `FilmGrid.tsx`, `styles.css`
