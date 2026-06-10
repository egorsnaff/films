import type { BrowseMedia, CatalogFilter } from "../lib/catalogFilter";
import type { BrowseSection } from "../data/browseSections";

type BrowseMenuProps = {
  media: BrowseMedia;
  sections: BrowseSection[];
  isLoading: boolean;
  error?: string | null;
  onMediaChange: (media: BrowseMedia) => void;
  onSelect: (filter: CatalogFilter) => void;
  onRetry?: () => void;
};

export function BrowseMenu({
  media,
  sections,
  isLoading,
  error,
  onMediaChange,
  onSelect,
  onRetry
}: BrowseMenuProps) {
  return (
    <section className="browse-view" id="main">
      <div className="browse-view__tabs" role="tablist" aria-label="Тип каталога">
        <button
          type="button"
          role="tab"
          className={`browse-view__tab${media === "films" ? " browse-view__tab--active" : ""}`}
          aria-selected={media === "films"}
          onClick={() => onMediaChange("films")}
        >
          Фильмы
        </button>
        <button
          type="button"
          role="tab"
          className={`browse-view__tab${media === "serials" ? " browse-view__tab--active" : ""}`}
          aria-selected={media === "serials"}
          onClick={() => onMediaChange("serials")}
        >
          Сериалы
        </button>
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
