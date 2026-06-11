import type { BrowseMedia, CatalogFilter } from "./catalogFilter";

export type ViewState = "catalog" | "watch" | "collections" | "collection" | "profile" | "browse";
export type CatalogMode = "premieres" | "search" | "films" | "serials" | "filtered";
export type MenuItem = "Фильмы" | "Сериалы" | "Каталог" | "Профиль";

export type LegacyMenuItem = MenuItem | "Главная";

export type NavigationSnapshot = {
  view: ViewState;
  activeMenu: LegacyMenuItem;
  catalogMode: CatalogMode;
  collectionId: string | null;
  filmId: number | null;
  searchQuery?: string;
  browseMedia?: BrowseMedia;
  catalogFilter?: CatalogFilter | null;
  scrollY: number;
};

export function getBackLabel(snapshot: NavigationSnapshot | undefined): string {
  if (!snapshot) {
    return "К фильмам";
  }

  switch (snapshot.view) {
    case "watch":
      return "Назад";
    case "collection":
      return "К подборке";
    case "collections":
      return "К подборкам";
    case "profile":
      return "В кабинет";
    case "browse":
      if (snapshot.activeMenu === "Каталог") {
        return "Назад";
      }
      return snapshot.browseMedia === "serials" ? "К сериалам" : "К фильмам";
    case "catalog":
      if (snapshot.catalogMode === "filtered") {
        return "К каталогу";
      }
      if (snapshot.catalogMode === "search") {
        return "К результатам";
      }
      if (snapshot.catalogMode === "serials") {
        return "К сериалам";
      }
      return "К фильмам";
    default:
      return "Назад";
  }
}
