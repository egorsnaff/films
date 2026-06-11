type KinopoiskAwardPerson = {
  nameRu?: string | null;
  nameEn?: string | null;
};

export type KinopoiskAwardRaw = {
  name?: string;
  win?: boolean;
  imageUrl?: string;
  nominationName?: string;
  year?: number;
  persons?: KinopoiskAwardPerson[];
};

export type FilmAwardItem = {
  nominationName: string;
  win: boolean;
  persons: string[];
};

export type FilmAwardGroup = {
  name: string;
  year: number;
  imageUrl?: string;
  wins: number;
  nominations: number;
  items: FilmAwardItem[];
};

export type FilmAwardSummaryChip = {
  name: string;
  wins: number;
  nominations: number;
  imageUrl?: string;
};

export type FilmAwardsPayload = {
  total: number;
  summary: FilmAwardSummaryChip[];
  groups: FilmAwardGroup[];
};

function personLabel(person: KinopoiskAwardPerson): string | null {
  const name = person.nameRu?.trim() || person.nameEn?.trim();
  return name || null;
}

function formatPersons(persons: KinopoiskAwardPerson[] | undefined): string[] {
  if (!persons?.length) {
    return [];
  }

  return persons
    .map(personLabel)
    .filter((name): name is string => Boolean(name));
}

export function aggregateFilmAwards(
  items: KinopoiskAwardRaw[],
  total?: number
): FilmAwardsPayload {
  if (items.length === 0) {
    return { total: total ?? 0, summary: [], groups: [] };
  }

  const groupMap = new Map<string, FilmAwardGroup>();

  for (const raw of items) {
    const name = raw.name?.trim();
    const nominationName = raw.nominationName?.trim();
    const year = raw.year;

    if (!name || !nominationName || !Number.isFinite(year)) {
      continue;
    }

    const groupKey = `${name}:${year}`;
    const existing = groupMap.get(groupKey) ?? {
      name,
      year,
      imageUrl: raw.imageUrl,
      wins: 0,
      nominations: 0,
      items: []
    };

    if (!existing.imageUrl && raw.imageUrl) {
      existing.imageUrl = raw.imageUrl;
    }

    const win = Boolean(raw.win);
    if (win) {
      existing.wins += 1;
    } else {
      existing.nominations += 1;
    }

    existing.items.push({
      nominationName,
      win,
      persons: formatPersons(raw.persons)
    });

    groupMap.set(groupKey, existing);
  }

  const groups = [...groupMap.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => {
        if (left.win !== right.win) {
          return left.win ? -1 : 1;
        }

        return left.nominationName.localeCompare(right.nominationName, "ru");
      })
    }))
    .sort((left, right) => {
      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }

      if (right.year !== left.year) {
        return right.year - left.year;
      }

      const leftTotal = left.wins + left.nominations;
      const rightTotal = right.wins + right.nominations;
      if (rightTotal !== leftTotal) {
        return rightTotal - leftTotal;
      }

      return left.name.localeCompare(right.name, "ru");
    });

  const summaryMap = new Map<string, FilmAwardSummaryChip>();

  for (const group of groups) {
    const existing = summaryMap.get(group.name) ?? {
      name: group.name,
      wins: 0,
      nominations: 0,
      imageUrl: group.imageUrl
    };

    existing.wins += group.wins;
    existing.nominations += group.nominations;

    if (!existing.imageUrl && group.imageUrl) {
      existing.imageUrl = group.imageUrl;
    }

    summaryMap.set(group.name, existing);
  }

  const summary = [...summaryMap.values()].sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    return right.nominations - left.nominations;
  });

  return {
    total: total ?? items.length,
    summary,
    groups
  };
}
