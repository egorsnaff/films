import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WIKI_PAGE = "250 лучших фильмов по версии IMDb";
const WIKI_URL =
  "https://ru.wikipedia.org/wiki/250_%D0%BB%D1%83%D1%87%D1%88%D0%B8%D1%85_%D1%84%D0%B8%D0%BB%D1%8C%D0%BC%D0%BE%D0%B2_%D0%BF%D0%BE_%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D0%B8_IMDb";
const OUTPUT_PATH = join(dirname(fileURLToPath(import.meta.url)), "../src/data/imdb-top-250.json");
const SEARCH_DELAY_MS = 350;

type WikiEntry = {
  rank: number;
  title: string;
  year: string | null;
};

type SearchFilm = {
  filmId?: number;
  kinopoiskId?: number;
  nameRu?: string;
  nameEn?: string;
  year?: string | number;
};

type MatchedEntry = WikiEntry & {
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

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitleFromCell(cell: string): string | null {
  const iwMatch = cell.match(/\{\{iw\|[^|]+\|([^|]+)\|/);
  if (iwMatch) {
    return iwMatch[1].trim();
  }

  const linkMatch = cell.match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/);
  if (linkMatch) {
    return linkMatch[1].trim();
  }

  const plain = cell.replace(/<[^>]+>/g, "").trim();
  return plain || null;
}

function parseWikiTable(wikitext: string): WikiEntry[] {
  const rows: WikiEntry[] = [];

  for (const line of wikitext.split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed.startsWith("|") ||
      trimmed.startsWith("|-") ||
      trimmed.includes("Название фильма") ||
      trimmed.startsWith("{|") ||
      trimmed.startsWith("|}")
    ) {
      continue;
    }

    const parts = trimmed.split("||").map((part) => part.trim());
    if (parts.length < 3) {
      continue;
    }

    const rank = parts[0].replace(/^\|\s*/, "").trim();
    if (!/^\d+$/.test(rank)) {
      continue;
    }

    const title = extractTitleFromCell(parts[1]);
    if (!title) {
      continue;
    }

    const yearMatch = parts[2].match(/(\d{4})/);
    rows.push({
      rank: Number.parseInt(rank, 10),
      title,
      year: yearMatch?.[1] ?? null
    });
  }

  return rows;
}

async function fetchWikiWikitext(): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    page: WIKI_PAGE,
    prop: "wikitext",
    format: "json"
  });
  const response = await fetch(`https://ru.wikipedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Wikipedia API failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    parse?: { wikitext?: { "*"?: string } };
  };
  const wikitext = payload.parse?.wikitext?.["*"];
  if (!wikitext) {
    throw new Error("Wikipedia wikitext is empty");
  }

  return wikitext;
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

  const payload = (await response.json()) as { films?: SearchFilm[] };
  return payload.films ?? [];
}

function scoreCandidate(candidate: SearchFilm, entry: WikiEntry): number {
  const kinopoiskId = candidate.filmId ?? candidate.kinopoiskId;
  if (!kinopoiskId) {
    return -1;
  }

  const candidateTitle = candidate.nameRu ?? candidate.nameEn ?? "";
  const normalizedCandidate = normalizeTitle(candidateTitle);
  const normalizedEntry = normalizeTitle(entry.title);
  let score = 0;

  if (normalizedCandidate === normalizedEntry) {
    score += 30;
  } else if (
    normalizedCandidate.includes(normalizedEntry) ||
    normalizedEntry.includes(normalizedCandidate)
  ) {
    score += 12;
  } else {
    score += 4;
  }

  const candidateYear = String(candidate.year ?? "");
  if (entry.year && candidateYear === entry.year) {
    score += 20;
  } else if (entry.year && candidateYear && Math.abs(Number(candidateYear) - Number(entry.year)) <= 1) {
    score += 8;
  }

  return score;
}

async function matchEntry(entry: WikiEntry): Promise<MatchedEntry> {
  const candidates = await searchFilms(entry.title);
  let best: { candidate: SearchFilm; score: number } | null = null;

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, entry);
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  const kinopoiskId = best?.candidate.filmId ?? best?.candidate.kinopoiskId ?? null;

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
  const wikitext = await fetchWikiWikitext();
  const wikiEntries = parseWikiTable(wikitext);

  if (wikiEntries.length < 240) {
    throw new Error(`Expected ~250 wiki rows, got ${wikiEntries.length}`);
  }

  const matched: MatchedEntry[] = [];

  for (const entry of wikiEntries) {
    const result = await matchEntry(entry);
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
      console.error(`  #${entry.rank} ${entry.title} (${entry.year ?? "?"})`);
    }
    process.exitCode = 1;
  }

  const payload = {
    source: WIKI_URL,
    syncedAt: new Date().toISOString(),
    entries: matched.map((entry) => ({
      rank: entry.rank,
      title: entry.title,
      year: entry.year,
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
