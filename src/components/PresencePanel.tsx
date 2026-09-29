import type { CSSProperties } from "react";

import { buildWatchFilmUrl } from "../lib/appRoutes";
import { describePresence, type PresenceEntry } from "../lib/presence";

type PresencePanelProps = {
  users: PresenceEntry[];
  collapsed: boolean;
  onToggle: () => void;
};

function avatarHue(username: string): number {
  let hash = 0;
  for (const char of username) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

function PresenceAvatar({ entry }: { entry: PresenceEntry }) {
  return (
    <span
      className={`presence-avatar${entry.online ? " presence-avatar--online" : ""}`}
      style={{ "--avatar-hue": avatarHue(entry.username) } as CSSProperties}
      aria-hidden="true"
    >
      {entry.username.charAt(0).toUpperCase()}
    </span>
  );
}

export function PresencePanel({ users, collapsed, onToggle }: PresencePanelProps) {
  const onlineCount = users.filter((entry) => entry.online).length;

  return (
    <aside
      className={`presence-panel${collapsed ? " presence-panel--collapsed" : ""}`}
      aria-label="Кто онлайн"
    >
      <button
        type="button"
        className="presence-panel__toggle"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Показать, кто онлайн" : "Скрыть панель «Кто онлайн»"}
        onClick={onToggle}
      >
        <span className="presence-panel__pulse" aria-hidden="true" />
        {collapsed ? (
          <span className="presence-panel__count">{onlineCount}</span>
        ) : (
          <span className="presence-panel__title">
            Сейчас на сайте <span className="presence-panel__count">{onlineCount}</span>
          </span>
        )}
      </button>

      {collapsed ? (
        <ul className="presence-panel__avatars">
          {users
            .filter((entry) => entry.online)
            .map((entry) => (
              <li key={entry.id} title={`${entry.username} — ${describePresence(entry)}`}>
                <PresenceAvatar entry={entry} />
              </li>
            ))}
        </ul>
      ) : (
        <ul className="presence-panel__list">
          {users.map((entry) => {
            const activity = entry.online ? entry.activity : undefined;
            return (
              <li
                key={entry.id}
                className={`presence-item${entry.online ? "" : " presence-item--offline"}`}
              >
                <PresenceAvatar entry={entry} />
                <span className="presence-item__copy">
                  <strong>{entry.username}</strong>
                  <small>{describePresence(entry)}</small>
                  {activity?.kind === "watching" ? (
                    <a
                      className="presence-item__film"
                      href={buildWatchFilmUrl(activity.kinopoiskId)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {activity.posterUrl ? (
                        <img
                          src={activity.posterUrl}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      ) : null}
                      <span>{activity.title}</span>
                    </a>
                  ) : null}
                </span>
              </li>
            );
          })}
          {users.length === 0 ? <li className="presence-panel__empty">Пока никого нет</li> : null}
        </ul>
      )}
    </aside>
  );
}
