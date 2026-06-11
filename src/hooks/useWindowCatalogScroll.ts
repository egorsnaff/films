import { useEffect, useRef } from "react";

import { SCROLL_PREFETCH_PX, shouldPrefetchByScroll } from "../lib/catalogFeed";
import type { CatalogMode } from "../lib/navigation";

type UseWindowCatalogScrollOptions = {
  enabled: boolean;
  catalogMode: CatalogMode;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
};

export function useWindowCatalogScroll({
  enabled,
  catalogMode,
  hasMore,
  isLoadingMore,
  onLoadMore
}: UseWindowCatalogScrollOptions) {
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);

  onLoadMoreRef.current = onLoadMore;
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;

  useEffect(() => {
    if (!enabled || catalogMode === "search") {
      return;
    }

    const maybeLoadMore = () => {
      if (!hasMoreRef.current || isLoadingMoreRef.current) {
        return;
      }

      if (shouldPrefetchByScroll(SCROLL_PREFETCH_PX)) {
        onLoadMoreRef.current();
      }
    };

    window.addEventListener("scroll", maybeLoadMore, { passive: true });
    window.addEventListener("resize", maybeLoadMore, { passive: true });
    maybeLoadMore();

    return () => {
      window.removeEventListener("scroll", maybeLoadMore);
      window.removeEventListener("resize", maybeLoadMore);
    };
  }, [catalogMode, enabled, hasMore]);

  useEffect(() => {
    if (!enabled || catalogMode === "search" || isLoadingMore || !hasMore) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (!hasMoreRef.current || isLoadingMoreRef.current) {
        return;
      }

      if (shouldPrefetchByScroll(SCROLL_PREFETCH_PX)) {
        onLoadMoreRef.current();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [catalogMode, enabled, hasMore, isLoadingMore]);
}
