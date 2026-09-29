import { useCallback, useState } from "react";

import { usePresence } from "../hooks/usePresence";
import {
  readPresenceCollapsed,
  writePresenceCollapsed,
  type PresenceActivity
} from "../lib/presence";

import { PresencePanel } from "./PresencePanel";

type PresenceDockProps = {
  activity: PresenceActivity;
};

// Отдельный компонент, чтобы опрос присутствия перерисовывал только панель, а не всё приложение.
export function PresenceDock({ activity }: PresenceDockProps) {
  const users = usePresence({ enabled: true, activity });
  const [collapsed, setCollapsed] = useState(readPresenceCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      writePresenceCollapsed(next);
      return next;
    });
  }, []);

  return <PresencePanel users={users} collapsed={collapsed} onToggle={toggle} />;
}
