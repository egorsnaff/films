# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single product, **films** — a Kinopoisk-powered film search/watch web app — split into two services that both must run for full end-to-end use:

- **frontend** (`/workspace`): React 19 + Vite SPA. Dev server: `npm run dev` (Vite, serves at `http://localhost:5173/films/` — note the `/films/` base path in dev). Vite proxies `/api/*` → `http://127.0.0.1:3001` (see `vite.config.ts`).
- **backend** (`/workspace/server`): Express 5 + TypeScript, embedded SQLite via `better-sqlite3`. Dev server: `npm run dev` (tsx watch, listens on port `3001`).

Standard commands live in `package.json` / `server/package.json` and `README.md` / `docs/AUTH.md`; prefer those. Notes that are non-obvious:

- **No linter.** There is no ESLint. The static-check/"lint" step is `tsc --noEmit`, which runs as part of `npm run build` / `npm run build:selfhost` (frontend) and `npm run build` (backend).
- **Backend env vars are NOT loaded from a `.env` file** (no dotenv). They must be exported in the shell before `npm run dev`, or passed inline. Minimum for dev:
  - `KINOPOISK_API_KEY` — required for any catalog/search/details. The repo ships a working fallback key in `.env.example` (`VITE_KINOPOISK_API_KEY`); the backend also accepts `VITE_KINOPOISK_API_KEY`. Without a key, `/kp/*` endpoints return an error.
  - `JWT_SECRET` (any string for dev), `DATABASE_PATH` (e.g. `/workspace/server/data/films.db`), `CORS_ORIGIN` (include `http://localhost:5173`), `COOKIE_SECURE=false`, `PORT=3001`.
- **Frontend dev env**: copy `.env.example` → `.env.local` (gitignored). Frontend `VITE_*` vars mostly configure embedded players/base path; the Kinopoisk key is used server-side.
- **Backend routes have NO `/api` prefix.** The frontend calls `/api/*`; the Vite dev proxy (and nginx in prod) strips `/api` before forwarding. So curl the backend directly at e.g. `http://127.0.0.1:3001/health`, `/auth/login`, `/kp/search`, but through the frontend at `http://127.0.0.1:5173/api/health`.
- **No public signup.** Create users with `npm run create-user -- <username> <password>` from `/workspace/server` (must set `DATABASE_PATH` to the same file the server uses). Auth is JWT in an httpOnly cookie (`films_session`).
- **Auth gate (default on):** `/kp/*` requires login. Set `AUTH_GATE_ENABLED=false` on the API and `VITE_AUTH_GATE=false` on the frontend for local dev without login. Tests disable the gate automatically (`MODE=test`).
- **External dependency**: the backend proxies and caches the external Kinopoisk Unofficial API (`https://kinopoiskapiunofficial.tech/api`) in SQLite. Live data needs outbound network access; responses are cached so repeat calls work offline-ish.
- Docker (`docker-compose.yml`) is for self-host/prod-style runs (frontend on `:8080`, api on `:3001`); for local dev prefer running the two `npm run dev` servers directly.
