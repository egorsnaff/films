import { useCallback, useEffect, useRef, useState } from "react";

import { usePresence } from "../hooks/usePresence";
import type { PresenceActivity } from "../lib/presence";

import { PresencePanel } from "./PresencePanel";

type PresenceDockProps = {
  activity: PresenceActivity;
};

// Отдельный компонент, чтобы опрос присутствия перерисовывал только панель, а не всё приложение.
export function PresenceDock({ activity }: PresenceDockProps) {
  const users = usePresence({ enabled: true, activity });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((current) => !current), []);

  return (
    <div className="presence-menu" ref={rootRef}>
      <PresencePanel users={users} open={open} onToggle={toggle} />
    </div>
  );
}
