export const TV_SERIES_KP_PAGES_PER_SEGMENT = 5;

export const TV_SERIES_YEAR_SEGMENTS = [
  { yearFrom: 2024, yearTo: 2026 },
  { yearFrom: 2022, yearTo: 2023 },
  { yearFrom: 2020, yearTo: 2021 },
  { yearFrom: 2018, yearTo: 2019 },
  { yearFrom: 2016, yearTo: 2017 },
  { yearFrom: 2014, yearTo: 2015 },
  { yearFrom: 2012, yearTo: 2013 },
  { yearFrom: 2010, yearTo: 2011 },
  { yearFrom: 2008, yearTo: 2009 },
  { yearFrom: 2006, yearTo: 2007 }
] as const;

export type TvSeriesCatalogPageMapping = {
  globalPage: number;
  segmentIndex: number;
  segmentPage: number;
  yearFrom: number;
  yearTo: number;
};

export function getTvSeriesCatalogTotalPages(): number {
  return TV_SERIES_YEAR_SEGMENTS.length * TV_SERIES_KP_PAGES_PER_SEGMENT;
}

export function resolveTvSeriesCatalogPage(globalPage: number): TvSeriesCatalogPageMapping {
  const safePage = Math.max(1, globalPage);
  const segmentIndex = Math.min(
    Math.floor((safePage - 1) / TV_SERIES_KP_PAGES_PER_SEGMENT),
    TV_SERIES_YEAR_SEGMENTS.length - 1
  );
  const segmentPage = ((safePage - 1) % TV_SERIES_KP_PAGES_PER_SEGMENT) + 1;
  const segment = TV_SERIES_YEAR_SEGMENTS[segmentIndex];

  return {
    globalPage: safePage,
    segmentIndex,
    segmentPage,
    yearFrom: segment.yearFrom,
    yearTo: segment.yearTo
  };
}
