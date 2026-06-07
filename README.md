# films

React/Vite app for searching films through the Kinopoisk Unofficial API and
rendering configurable embedded players.

## Features

- Kinopoisk Unofficial API client pointed at
  `https://kinopoiskapiunofficial.tech/api`
- Keyword search and film details loading
- Configurable player tabs based on URL templates
- Default Alloha player and trailer search by Kinopoisk ID/title
- Safe player rendering: only `https` iframe URLs are allowed

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app includes the current Kinopoisk API key as a fallback. To override it,
set:

```env
VITE_KINOPOISK_API_KEY=your-key
VITE_KINOPOISK_API_BASE_URL=https://kinopoiskapiunofficial.tech/api
```

## GitHub Pages

After the Pages workflow is merged into `main` and GitHub Pages is enabled for
GitHub Actions deployments, the app is available at:

```text
https://egorsnaff.github.io/films/
```

The Vite `base` option is set to `/films/`, so built assets resolve correctly
under the repository Pages path.

## Player templates

Players are configured through `VITE_PLAYER_TEMPLATES` as a JSON array. Each
template supports `{kinopoiskId}`, `{title}`, `{originalTitle}`, and `{year}`
placeholders.

By default, the app enables:

- `Alloha` through `https://harald-as.newplayjj.com/?kp={kinopoiskId}&token=...`
- `Collaps` through `https://api.atomics.ws/embed/kp/{kinopoiskId}`
- `VideoCDN` through `https://p.lumex.space/...&kp_id={kinopoiskId}`
- `Coll` through the hometv hardcoded `api.bhcesh.me` token, resolved lazily
- `kodi` through the hometv hardcoded `kodikapi.com` token, resolved lazily
- `HDVB` through `VITE_HDVB_TOKEN` or `VITE_API_HDTV_KEY`, resolved lazily
- `Kodik` through `https://kodik.cc/find-player?kinopoiskID={kinopoiskId}`
- `Трейлер` through `https://api.atomics.ws/embed/trailer-kp/{kinopoiskId}`

Lazy players load only when their tab is selected, matching the `hometv`
approach and avoiding unnecessary balancer API calls.

```env
VITE_PLAYER_TEMPLATES='[{"id":"alloha","title":"Alloha","embedUrlTemplate":"https://harald-as.newplayjj.com/?kp={kinopoiskId}&token=e7b61f129f4a392ac4bf6726a9dd6a"},{"id":"server","title":"Server","embedUrlTemplate":"https://watch.example.test/embed?kp={kinopoiskId}&title={title}"}]'
VITE_HDVB_TOKEN=optional-hdvb-token
```

When your server is ready, add it as another template without changing the
React component.

## Scripts

```bash
npm test
npm run build
```
