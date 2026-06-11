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
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const nearEndRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  onLoadMoreRef.current = onLoadMore;
  hasMoreRef.current = hasMore;
  isLoadingMoreRef.current = isLoadingMore;

  useEffect(() => {
    if (!enabled || catalogMode === "search") {
      nearEndRef.current = false;
      setNearEnd(false);
      return;
    }

    const setNearEndIfChanged = (value: boolean) => {
      if (nearEndRef.current === value) {
        return;
      }

      nearEndRef.current = value;
      setNearEnd(value);
    };

    const syncScrollState = () => {
      const threshold = getScrollPrefetchThreshold();
      const isNearEnd = shouldPrefetchByScroll(threshold);
      setNearEndIfChanged(isNearEnd);

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
  }, [catalogMode, enabled]);

  return { nearEnd };
}
