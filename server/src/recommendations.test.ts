import { describe, expect, it } from "vitest";

import {
  buildGenreProfile,
  buildReason,
  countProfileFilms,
  interleaveByGenre,
  scoreFilm,
  topGenres,
  yearRecency
} from "./recommendations.js";
import type { CachedFilm } from "./kpCache.js";
import type { DbUserFilm } from "./db.js";

const sampleFilm = (id: number, genres?: string[], rating = "7.5", year = "2024"): CachedFilm => ({
  kinopoiskId: id,
  title: `Film ${id}`,
  genres,
  rating,
  year
});

const sampleItem = (
  kinopoiskId: number,
  status: DbUserFilm["status"],
  updatedAt = "2026-01-01T00:00:00.000Z"
): DbUserFilm => ({
  user_id: 1,
  kinopoisk_id: kinopoiskId,
  status,
  watch_seconds: 0,
  progress_percent: 0,
  updated_at: updatedAt
});

describe("recommendations profile", () => {
  it("builds weighted genre profile from watched, watching and plan", () => {
    const items = [
      sampleItem(1, "watched"),
      sampleItem(2, "watching"),
      sampleItem(3, "plan"),
      sampleItem(4, "waiting")
    ];
    const films = {
      1: sampleFilm(1, ["Драма", "Триллер"]),
      2: sampleFilm(2, ["Фантастика"]),
      3: sampleFilm(3, ["Драма"]),
      4: sampleFilm(4, ["Ужасы"])
    };

    expect(buildGenreProfile(items, films)).toEqual({
      драма: 4,
      триллер: 3,
      фантастика: 2
    });
    expect(countProfileFilms(items, films)).toBe(3);
    expect(topGenres(buildGenreProfile(items, films))).toEqual(["драма", "триллер"]);
    expect(buildReason(buildGenreProfile(items, films))).toBe(
      "Потому что вам нравятся драма и триллер"
    );
  });
});

describe("recommendations scoring", () => {
  it("penalizes films already in user lists and rewards matching genres", () => {
    const profile = { драма: 6, фантастика: 3 };
    const userFilmIds = new Set([99]);

    const recommended = scoreFilm(sampleFilm(1, ["Драма"], "8.1", "2025"), profile, userFilmIds);
    const excluded = scoreFilm(sampleFilm(99, ["Драма"], "9.0", "2025"), profile, userFilmIds);

    expect(recommended).toBeGreaterThan(6);
    expect(excluded).toBe(-100);
    expect(yearRecency("2024")).toBeGreaterThan(yearRecency("1995"));
  });

  it("interleaves top picks by genre to avoid long runs", () => {
    const films = interleaveByGenre(
      [
        { film: sampleFilm(1, ["Драма"]), score: 10, primaryGenre: "драма" },
        { film: sampleFilm(2, ["Драма"]), score: 9, primaryGenre: "драма" },
        { film: sampleFilm(3, ["Фантастика"]), score: 8, primaryGenre: "фантастика" },
        { film: sampleFilm(4, ["Фантастика"]), score: 7, primaryGenre: "фантастика" }
      ],
      4
    );

    expect(films.map((film) => film.kinopoiskId)).toEqual([1, 3, 2, 4]);
  });
});
