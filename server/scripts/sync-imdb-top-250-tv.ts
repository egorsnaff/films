import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://www.imdb.com/chart/toptv/";
const CHART_JSON_URL =
  "https://raw.githubusercontent.com/crazyuploader/IMDb_Top_50/main/data/top250/shows.json";
const OUTPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../src/data/imdb-top-250-tv.json");
const SEARCH_DELAY_MS = 350;

type ImdbChartEntry = {
  rank: number;
  title: string;
  imdbId: string;
};

type SearchFilm = {
  filmId?: number;
  kinopoiskId?: number;
  nameRu?: string;
  nameEn?: string;
  year?: string | number;
};

type MatchedEntry = ImdbChartEntry & {
  kinopoiskId: number | null;
  matchedTitle?: string;
  matchedYear?: string;
  matchScore: number;
};

function getApiKey(): string {
  const apiKey =
    process.env.KINOPOISK_API_KEY ??
    process.env.VITE_KINOPOISK_API_KEY ??
    "";

  if (!apiKey.trim()) {
    throw new Error("KINOPOISK_API_KEY is required");
  }

  return apiKey.trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeTitle(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/&amp;/g, "and")
    .replace(/&apos;/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImdbId(link: string): string | null {
  const match = link.match(/tt\d+/);
  return match?.[0] ?? null;
}

async function fetchImdbChartEntries(): Promise<ImdbChartEntry[]> {
  const response = await fetch(CHART_JSON_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch IMDb TV chart JSON (${response.status})`);
  }

  const payload = (await response.json()) as Array<{
    Rank?: number;
    name?: string;
    link?: string;
  }>;

  const entries: ImdbChartEntry[] = [];

  for (const row of payload) {
    const rank = row.Rank;
    const title = decodeHtmlEntities(row.name?.trim() ?? "");
    const imdbId = row.link ? extractImdbId(row.link) : null;

    if (!rank || !title || !imdbId) {
      continue;
    }

    entries.push({ rank, title, imdbId });
  }

  entries.sort((left, right) => left.rank - right.rank);
  return entries;
}

async function searchFilms(keyword: string): Promise<SearchFilm[]> {
  const params = new URLSearchParams({
    keyword,
    page: "1"
  });
  const response = await fetch(
    `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "X-API-KEY": getApiKey()
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Kinopoisk search failed for "${keyword}" (${response.status})`);
  }

  const data = (await response.json()) as { films?: SearchFilm[] };
  return data.films ?? [];
}

function scoreCandidate(candidate: SearchFilm, entry: ImdbChartEntry): number {
  const kinopoiskId = candidate.filmId ?? candidate.kinopoiskId;
  if (!kinopoiskId) {
    return -1;
  }

  const candidateRu = normalizeTitle(candidate.nameRu ?? "");
  const candidateEn = normalizeTitle(candidate.nameEn ?? "");
  const normalizedEntry = normalizeTitle(entry.title);
  let score = 0;

  if (candidateEn === normalizedEntry || candidateRu === normalizedEntry) {
    score += 30;
  } else if (
    candidateEn.includes(normalizedEntry) ||
    normalizedEntry.includes(candidateEn) ||
    candidateRu.includes(normalizedEntry) ||
    normalizedEntry.includes(candidateRu)
  ) {
    score += 12;
  } else {
    score += 4;
  }

  return score;
}

const MANUAL_KINOPOISK_BY_IMDB: Record<string, number> = {
  tt0290978: 258550,
  tt0314979: 229181,
  tt0407362: 229162,
  tt0158417: 453176
};

async function matchEntry(
  entry: ImdbChartEntry,
  usedKinopoiskIds: Set<number>
): Promise<MatchedEntry> {
  const manualId = MANUAL_KINOPOISK_BY_IMDB[entry.imdbId];
  if (manualId) {
    return {
      ...entry,
      kinopoiskId: manualId,
      matchScore: 100
    };
  }

  const searchTerms = [entry.title];
  if (entry.title.includes("L'amica geniale")) {
    searchTerms.push("My Brilliant Friend");
  }
  if (entry.title.includes("Ore dake reberu appu na ken")) {
    searchTerms.push("Solo Leveling");
  }

  let best: { candidate: SearchFilm; score: number } | null = null;

  for (const term of searchTerms) {
    const candidates = await searchFilms(term);
    for (const candidate of candidates) {
      const kinopoiskId = candidate.filmId ?? candidate.kinopoiskId;
      if (!kinopoiskId || usedKinopoiskIds.has(kinopoiskId)) {
        continue;
      }

      const score = scoreCandidate(candidate, entry);
      if (!best || score > best.score) {
        best = { candidate, score };
      }
    }
  }

  if (!best) {
    for (const term of searchTerms) {
      const candidates = await searchFilms(term);
      for (const candidate of candidates) {
        const score = scoreCandidate(candidate, entry);
        if (!best || score > best.score) {
          best = { candidate, score };
        }
      }
    }
  }

  const kinopoiskId = best?.candidate.filmId ?? best?.candidate.kinopoiskId ?? null;
  if (kinopoiskId) {
    usedKinopoiskIds.add(kinopoiskId);
  }

  return {
    ...entry,
    kinopoiskId: kinopoiskId ?? null,
    matchedTitle: best?.candidate.nameRu ?? best?.candidate.nameEn,
    matchedYear: best?.candidate.year ? String(best.candidate.year) : undefined,
    matchScore: best?.score ?? 0
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  const chartEntries = await fetchImdbChartEntries();

  if (chartEntries.length < 240) {
    throw new Error(`Expected ~250 IMDb TV rows, got ${chartEntries.length}`);
  }

  const matched: MatchedEntry[] = [];
  const usedKinopoiskIds = new Set<number>();

  for (const entry of chartEntries) {
    const result = await matchEntry(entry, usedKinopoiskIds);
    matched.push(result);
    process.stdout.write(
      `${entry.rank.toString().padStart(3, " ")}. ${entry.title} -> ${
        result.kinopoiskId ?? "MISS"
      }\n`
    );
    await sleep(SEARCH_DELAY_MS);
  }

  const unresolved = matched.filter((entry) => entry.kinopoiskId === null);
  if (unresolved.length > 0) {
    console.error("\nUnresolved entries:");
    for (const entry of unresolved) {
      console.error(`  #${entry.rank} ${entry.title} (${entry.imdbId})`);
    }
    process.exitCode = 1;
  }

  const payload = {
    source: SOURCE_URL,
    syncedAt: new Date().toISOString(),
    entries: matched.map((entry) => ({
      rank: entry.rank,
      title: entry.title,
      year: entry.matchedYear ?? null,
      imdbId: entry.imdbId,
      kinopoiskId: entry.kinopoiskId,
      matchedTitle: entry.matchedTitle,
      matchedYear: entry.matchedYear,
      matchScore: entry.matchScore
    }))
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${matched.length} entries to ${OUTPUT_PATH}`);
}

void main();
