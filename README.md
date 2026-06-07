# films

React/Vite app for searching films through the Kinopoisk Unofficial API and
rendering configurable embedded players.

## Features

- Kinopoisk Unofficial API client pointed at
  `https://kinopoiskapiunofficial.tech/api`
- Keyword search and film details loading
- Configurable player tabs based on URL templates
- Safe player rendering: only `http` and `https` iframe URLs are allowed

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

## Player templates

Players are configured through `VITE_PLAYER_TEMPLATES` as a JSON array. Each
template supports `{kinopoiskId}`, `{title}`, and `{originalTitle}` placeholders.

```env
VITE_PLAYER_TEMPLATES='[{"id":"server","title":"Server","embedUrlTemplate":"https://watch.example.test/embed?kp={kinopoiskId}&title={title}"}]'
```

When your server is ready, add it as another template without changing the
React component.

## Scripts

```bash
npm test
npm run build
```
