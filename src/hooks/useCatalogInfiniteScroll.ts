import { useEffect, useRef, type RefObject } from "react";

import type { CatalogMode } from "../lib/navigation";

type UseCatalogInfiniteScrollOptions = {
  enabled: boolean;
  catalogMode: CatalogMode;
  hasMore: boolean;
  isLoadingMore: boolean;
  sentinelRef: RefObject<HTMLElement | null>;
  onLoadMore: () => void;
  resetKey: number;
};

export function useCatalogInfiniteScroll({
  enabled,
  catalogMode,
  hasMore,
  isLoadingMore,
  sentinelRef,
  onLoadMore,
  resetKey
}: UseCatalogInfiniteScrollOptions) {
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!enabled || catalogMode === "search" || !hasMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || isLoadingMore) {
          return;
        }

        onLoadMoreRef.current();
      },
      { root: null, rootMargin: "480px 0px 240px 0px", threshold: 0 }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [catalogMode, enabled, hasMore, isLoadingMore, resetKey, sentinelRef]);
}
