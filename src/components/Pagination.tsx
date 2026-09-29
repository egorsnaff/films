type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export type PaginationItem = number | "gap";

export function getPaginationItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) {
    [2, 3, 4].forEach((entry) => pages.add(entry));
  }
  if (page >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((entry) => pages.add(entry));
  }

  const sorted = [...pages].filter((entry) => entry >= 1 && entry <= totalPages).sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  sorted.forEach((entry, index) => {
    if (index > 0 && entry - sorted[index - 1] > 1) {
      items.push("gap");
    }
    items.push(entry);
  });
  return items;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="pagination" aria-label="Страницы">
      <button
        type="button"
        className="pagination__button pagination__button--step"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Предыдущая страница"
      >
        ←
      </button>
      {getPaginationItems(page, totalPages).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pagination__button${item === page ? " is-active" : ""}`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className="pagination__button pagination__button--step"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Следующая страница"
      >
        →
      </button>
    </nav>
  );
}
