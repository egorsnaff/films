import { describe, expect, it } from "vitest";

import {
  buildAppUrl,
  buildWatchFilmUrl,
  createHomeSnapshot,
  isSameAppUrl,
  parseLocationToSnapshot
} from "./appRoutes";
import { createCatalogFilter } from "./catalogFilter";

const BASE = "/films/";

describe("appRoutes", () => {
  it("builds watch, serials, search and filter paths under base", () => {
    expect(
      buildAppUrl(
        {
          ...createHomeSnapshot(),
          view: "watch",
          filmId: 301
        },
        BASE
      )
    ).toBe("/films/watch/301");
    expect(buildWatchFilmUrl(301, BASE)).toBe("/films/watch/301");

    expect(
      buildAppUrl(
        {
          ...createHomeSnapshot(),
          catalogMode: "serials",
          activeMenu: "Сериалы"
        },
        BASE
      )
    ).toBe("/films/serials");

    expect(
      buildAppUrl(
        {
          ...createHomeSnapshot(),
          catalogMode: "search",
          searchQuery: "матрица"
        },
        BASE
      )
    ).toBe("/films/search?q=%D0%BC%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0");

    const filter = createCatalogFilter({
      title: "Драмы",
      kind: "genre",
      media: "films",
      genreId: 8
    });

    expect(
      buildAppUrl(
        {
          ...createHomeSnapshot(),
          catalogMode: "filtered",
          catalogFilter: filter,
          page: 2
        },
        BASE
      )
    ).toBe(`/films/filter/${encodeURIComponent(filter.id)}?page=2`);
  });

  it("omits page=1 from catalog urls", () => {
    expect(buildAppUrl(createHomeSnapshot(), BASE)).toBe("/films/");
    expect(buildAppUrl({ ...createHomeSnapshot(), page: 1 }, BASE)).toBe("/films/");
    expect(buildAppUrl({ ...createHomeSnapshot(), page: 3 }, BASE)).toBe("/films/?page=3");
  });

  it("parses deep links back into navigation snapshots", () => {
    expect(
      parseLocationToSnapshot({ pathname: "/films/watch/301", search: "" }, BASE)
    ).toMatchObject({
      view: "watch",
      filmId: 301
    });

    expect(
      parseLocationToSnapshot({ pathname: "/films/serials", search: "?page=2" }, BASE)
    ).toMatchObject({
      view: "catalog",
      catalogMode: "serials",
      page: 2
    });

    expect(
      parseLocationToSnapshot(
        { pathname: "/films/search", search: "?q=%D0%BC%D0%B0%D1%82%D1%80%D0%B8%D1%86%D0%B0" },
        BASE
      )
    ).toMatchObject({
      catalogMode: "search",
      searchQuery: "матрица"
    });

    const parsedFilter = parseLocationToSnapshot(
      {
        pathname: `/films/filter/${encodeURIComponent("genre:films:8")}`,
        search: "?page=4"
      },
      BASE
    );

    expect(parsedFilter).toMatchObject({
      catalogMode: "filtered",
      page: 4,
      catalogFilter: {
        id: "genre:films:8",
        kind: "genre",
        media: "films",
        genreId: 8
      }
    });
  });

  it("treats home urls as equal regardless of trailing slash details", () => {
    const home = createHomeSnapshot();
    const parsed = parseLocationToSnapshot({ pathname: "/films/", search: "" }, BASE);
    expect(isSameAppUrl(home, parsed, BASE)).toBe(true);
  });
});
