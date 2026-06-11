import { useEffect, useRef, useState } from "react";

import {
  getScrollPrefetchThreshold,
  shouldPrefetchByScroll
} from "../lib/catalogFeed";
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
  const [nearEnd, setNearEnd] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const rafRef = useRef<number | null>(null);

  onLoadMoreRef.current = onLoadMore;
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;

  useEffect(() => {
    if (!enabled || catalogMode === "search") {
      setNearEnd(false);
      setHasUserScrolled(false);
      return;
    }

    const syncScrollState = () => {
      if (window.scrollY > 72) {
        setHasUserScrolled(true);
      }

      const threshold = getScrollPrefetchThreshold();
      const isNearEnd = shouldPrefetchByScroll(threshold);
      setNearEnd(isNearEnd);

      if (isNearEnd && hasMoreRef.current && !isLoadingMoreRef.current) {
        onLoadMoreRef.current();
      }
    };

    const scheduleSync = () => {
      if (rafRef.current !== null) {
        return;
      }

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        syncScrollState();
      });
    };

    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });
    scheduleSync();

    return () => {
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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

      if (shouldPrefetchByScroll(getScrollPrefetchThreshold())) {
        onLoadMoreRef.current();
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [catalogMode, enabled, hasMore, isLoadingMore]);

  return { nearEnd, hasUserScrolled };
}
