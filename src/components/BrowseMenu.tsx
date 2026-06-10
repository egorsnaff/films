import type { BrowseMedia, CatalogFilter } from "../lib/catalogFilter";
import type { BrowseSection } from "../data/browseSections";

type BrowseMenuProps = {
  media: BrowseMedia;
  sections: BrowseSection[];
  isLoading: boolean;
  error?: string | null;
  onSelect: (filter: CatalogFilter) => void;
  onRetry?: () => void;
};

export function BrowseMenu({
  media,
  sections,
  isLoading,
  error,
  onSelect,
  onRetry
}: BrowseMenuProps) {
  const title = media === "films" ? "Каталог фильмов" : "Каталог сериалов";
  const subtitle =
    media === "films"
      ? "Жанры, подборки, годы и страны — каждый пункт открывает отдельную ленту с сортировкой по рейтингу."
      : "Категории, жанры и страны — отдельная лента для каждого раздела.";

  return (
    <section className="browse-view" id="main">
      <div className="section-heading section-heading--browse">
        <p className="eyebrow">{media === "films" ? "films" : "series"}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      {isLoading ? (
        <div className="browse-view__loading" aria-label="Загрузка фильтров">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="browse-section-skeleton">
              <span className="browse-section-skeleton__title" />
              <div className="browse-section-skeleton__chips">
                {Array.from({ length: 8 }).map((__, chipIndex) => (
                  <span key={chipIndex} className="browse-chip-skeleton" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="empty-state empty-state--composed">
          <span className="empty-state__marker">!</span>
          <strong>Не удалось загрузить фильтры</strong>
          <p>{error}</p>
          {onRetry ? (
            <button type="button" className="load-more-button" onClick={onRetry}>
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}

      {!isLoading && !error
        ? sections.map((section) => (
            <section key={section.id} className="browse-section" aria-labelledby={`browse-${section.id}`}>
              <div className="browse-section__head">
                <h2 id={`browse-${section.id}`}>{section.title}</h2>
              </div>
              <div className="browse-section__grid">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="browse-chip"
                    onClick={() => onSelect(item)}
                  >
                    <span className="browse-chip__label">{item.title}</span>
                    <span className="browse-chip__arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
        : null}
    </section>
  );
}
