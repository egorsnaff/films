import type { BrowseMedia, CatalogFilter } from "./catalogFilter";

export type ViewState =
  | "catalog"
  | "watch"
  | "collections"
  | "collection"
  | "profile"
  | "browse"
  | "admin";
export type CatalogMode = "premieres" | "search" | "films" | "serials" | "filtered";
export type MenuItem = "Фильмы" | "Сериалы" | "Каталог" | "Профиль";

export type LegacyMenuItem = MenuItem | "Главная";

export const PROFILE_LIST_KEYS = ["watching", "shared", "plan", "watched"] as const;
export type ProfileListKey = (typeof PROFILE_LIST_KEYS)[number];

export function isProfileListKey(value: string | undefined): value is ProfileListKey {
  return PROFILE_LIST_KEYS.includes(value as ProfileListKey);
}

export type NavigationSnapshot = {
  view: ViewState;
  activeMenu: LegacyMenuItem;
  catalogMode: CatalogMode;
  collectionId: string | null;
  filmId: number | null;
  searchQuery?: string;
  browseMedia?: BrowseMedia;
  catalogFilter?: CatalogFilter | null;
  /** Opened profile list page (`/profile/<key>`); null on the profile overview. */
  profileList?: ProfileListKey | null;
  /** Last loaded catalog page or current profile list page (synced to ?page=). */
  page?: number;
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
      return snapshot.profileList ? "К списку" : "В кабинет";
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
