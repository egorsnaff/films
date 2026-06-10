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

function isSentinelNearViewport(sentinel: HTMLElement): boolean {
  const rect = sentinel.getBoundingClientRect();
  return rect.top <= window.innerHeight + 200;
}

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
  const isLoadingMoreRef = useRef(isLoadingMore);
  onLoadMoreRef.current = onLoadMore;
  isLoadingMoreRef.current = isLoadingMore;

  useEffect(() => {
    if (!enabled || catalogMode === "search" || !hasMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const maybeLoadMore = () => {
      if (isLoadingMoreRef.current) {
        return;
      }

      onLoadMoreRef.current();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        maybeLoadMore();
      },
      { root: null, rootMargin: "200px 0px 120px 0px", threshold: 0 }
    );

    observer.observe(sentinel);

    if (isSentinelNearViewport(sentinel)) {
      maybeLoadMore();
    }

    return () => observer.disconnect();
  }, [catalogMode, enabled, hasMore, resetKey, sentinelRef]);

  useEffect(() => {
    if (!enabled || catalogMode === "search" || !hasMore || isLoadingMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel || !isSentinelNearViewport(sentinel)) {
      return;
    }

    onLoadMoreRef.current();
  }, [catalogMode, enabled, hasMore, isLoadingMore, resetKey, sentinelRef]);
}
