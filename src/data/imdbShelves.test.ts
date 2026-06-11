import { describe, expect, it } from "vitest";

import {
  createImdbFilmsTopFilter,
  createImdbSerialsTopFilter,
  IMDB_FILMS_SHELF_TITLE,
  IMDB_SERIALS_SHELF_TITLE
} from "./imdbShelves";

describe("imdbShelves", () => {
  it("builds top filters for films and serials", () => {
    expect(createImdbFilmsTopFilter()).toMatchObject({
      title: IMDB_FILMS_SHELF_TITLE,
      kind: "top",
      media: "films",
      topType: "IMDB_TOP_250"
    });
    expect(createImdbSerialsTopFilter()).toMatchObject({
      title: IMDB_SERIALS_SHELF_TITLE,
      kind: "top",
      media: "serials",
      topType: "IMDB_TOP_250_TV"
    });
  });
});
