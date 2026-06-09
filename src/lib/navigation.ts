export type ViewState = "catalog" | "watch" | "collections" | "collection" | "profile";
export type CatalogMode = "premieres" | "search" | "films" | "serials";
export type MenuItem = "Главная" | "Фильмы" | "Сериалы" | "Подборки" | "Профиль";

export type NavigationSnapshot = {
  view: ViewState;
  activeMenu: MenuItem;
  catalogMode: CatalogMode;
  collectionId: string | null;
  filmId: number | null;
  searchQuery?: string;
  scrollY: number;
};

export function getBackLabel(snapshot: NavigationSnapshot | undefined): string {
  if (!snapshot) {
    return "На главную";
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
    case "catalog":
      if (snapshot.catalogMode === "search") {
        return "К результатам";
      }
      if (snapshot.catalogMode === "films") {
        return "К фильмам";
      }
      if (snapshot.catalogMode === "serials") {
        return "К сериалам";
      }
      return "На главную";
    default:
      return "Назад";
  }
}
