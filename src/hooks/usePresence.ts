import { useCallback, useEffect, useRef, useState } from "react";

import type { PresenceActivity, PresenceEntry } from "../lib/presence";
import { siteApi } from "../lib/siteApi";

export const PRESENCE_VISIBLE_INTERVAL_MS = 15_000;
export const PRESENCE_HIDDEN_INTERVAL_MS = 60_000;
export const PRESENCE_CHANGE_DEBOUNCE_MS = 2_000;

type UsePresenceOptions = {
  enabled: boolean;
  activity: PresenceActivity;
};

function createTabId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isPageVisible(): boolean {
  return document.visibilityState !== "hidden";
}

export function usePresence({ enabled, activity }: UsePresenceOptions): PresenceEntry[] {
  const [users, setUsers] = useState<PresenceEntry[]>([]);
  const tabIdRef = useRef(createTabId());
  const activityRef = useRef(activity);
  const lastSentAtRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const activeRef = useRef(false);
  const activityKey = JSON.stringify(activity);

  activityRef.current = activity;

  const send = useCallback(async () => {
    window.clearTimeout(timerRef.current);
    if (!activeRef.current) {
      return;
    }

    const visible = isPageVisible();
    lastSentAtRef.current = Date.now();

    try {
      const result = await siteApi.updatePresence({
        tabId: tabIdRef.current,
        activity: activityRef.current,
        visible
      });
      if (result && visible && activeRef.current) {
        setUsers(result);
      }
    } catch {
      // Панель присутствия второстепенна: следующая попытка будет по таймеру.
    }

    if (!activeRef.current) {
      return;
    }

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => void send(),
      isPageVisible() ? PRESENCE_VISIBLE_INTERVAL_MS : PRESENCE_HIDDEN_INTERVAL_MS
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    activeRef.current = true;
    const tabId = tabIdRef.current;
    const leave = () => {
      void siteApi.updatePresence({ tabId, leaving: true }, { keepalive: true }).catch(() => undefined);
    };
    const handleVisibilityChange = () => void send();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", handleVisibilityChange);

    return () => {
      activeRef.current = false;
      window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", handleVisibilityChange);
      leave();
      setUsers([]);
    };
  }, [enabled, send]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const wait = Math.max(0, PRESENCE_CHANGE_DEBOUNCE_MS - (Date.now() - lastSentAtRef.current));
    const timer = window.setTimeout(() => void send(), wait);
    return () => window.clearTimeout(timer);
  }, [activityKey, enabled, send]);

  return users;
}
