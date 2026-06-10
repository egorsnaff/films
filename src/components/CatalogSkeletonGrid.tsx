type CatalogSkeletonGridProps = {
  count?: number;
  variant?: "grid" | "inline";
  label?: string;
};

export function CatalogSkeletonGrid({
  count = 10,
  variant = "grid",
  label = "Подгружаем следующую страницу"
}: CatalogSkeletonGridProps) {
  return (
    <div
      className={`catalog-skeleton-grid catalog-skeleton-grid--${variant}`}
      aria-hidden={variant === "inline" ? true : undefined}
      aria-label={variant === "grid" ? label : undefined}
      role={variant === "grid" ? "status" : undefined}
    >
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className="catalog-skeleton-card">
          <span className="catalog-skeleton-card__poster film-skeleton" />
          <span className="catalog-skeleton-card__body">
            <span className="catalog-skeleton-card__line catalog-skeleton-card__line--title" />
            <span className="catalog-skeleton-card__line catalog-skeleton-card__line--meta" />
          </span>
        </span>
      ))}
    </div>
  );
}
