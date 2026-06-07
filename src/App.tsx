import { FormEvent, useMemo, useState } from "react";

import { MoviePlayers } from "./components/MoviePlayers";
import {
  KinopoiskFilm,
  KinopoiskFilmDetails,
  createKinopoiskClient
} from "./lib/kinopoisk";
import { createPlayerSources, parsePlayerTemplates } from "./lib/playerSources";
import "./styles.css";

const DEFAULT_API_KEY = "e99d6de0-9f14-42e9-b3c6-32172a36d434";
const DEFAULT_API_BASE_URL = "https://kinopoiskapiunofficial.tech/api";

const apiKey = import.meta.env.VITE_KINOPOISK_API_KEY || DEFAULT_API_KEY;
const apiBaseUrl = import.meta.env.VITE_KINOPOISK_API_BASE_URL || DEFAULT_API_BASE_URL;
const playerTemplates = parsePlayerTemplates(import.meta.env.VITE_PLAYER_TEMPLATES);

type LoadState = "idle" | "loading" | "success" | "error";

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

  async function handleSelectFilm(film: KinopoiskFilm) {
    setError(null);
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
      <section className="hero">
        <p className="eyebrow">films</p>
        <h1>Поиск фильмов через Kinopoisk Unofficial API</h1>
        <p>
          API переведён на <code>kinopoiskapiunofficial.tech/api</code>. Ключ можно
          заменить через <code>VITE_KINOPOISK_API_KEY</code>.
        </p>
      </section>

      <form className="search-form" onSubmit={handleSearch}>
        <label htmlFor="search">Название фильма</label>
        <div>
          <input
            id="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например: Интерстеллар"
          />
          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Ищем..." : "Найти"}
          </button>
        </div>
      </form>

      {error ? <p className="error-message">{error}</p> : null}

      <section className="content-grid">
        <div className="film-list" aria-live="polite">
          {films.length === 0 && status !== "loading" ? (
            <p className="empty-state">Введите название и запустите поиск.</p>
          ) : null}

          {films.map((film) => (
            <button
              key={film.kinopoiskId}
              type="button"
              className="film-card"
              onClick={() => void handleSelectFilm(film)}
            >
              {film.posterUrl ? (
                <img src={film.posterUrl} alt="" loading="lazy" />
              ) : (
                <span className="poster-placeholder">Нет постера</span>
              )}
              <span>
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

        <aside className="details-panel">
          {detailsStatus === "loading" ? <p>Загружаем детали...</p> : null}
          {selectedFilm ? (
            <>
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
              {selectedFilm.description ? <p>{selectedFilm.description}</p> : null}
              <MoviePlayers players={players} />
              {players.length === 0 ? (
                <p className="hint">
                  Добавьте <code>VITE_PLAYER_TEMPLATES</code>, чтобы подключить свои
                  embed-плееры или будущий сервер.
                </p>
              ) : null}
            </>
          ) : (
            <p className="empty-state">Выберите фильм, чтобы увидеть детали и плееры.</p>
          )}
        </aside>
      </section>
    </main>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Что-то пошло не так";
}
