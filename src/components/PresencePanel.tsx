import type { CSSProperties } from "react";

import { buildWatchFilmUrl } from "../lib/appRoutes";
import { describePresence, type PresenceEntry } from "../lib/presence";

type PresencePanelProps = {
  users: PresenceEntry[];
  open: boolean;
  onToggle: () => void;
};

const TRIGGER_AVATAR_LIMIT = 3;

function avatarHue(username: string): number {
  let hash = 0;
  for (const char of username) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

function PresenceAvatar({ entry, compact = false }: { entry: PresenceEntry; compact?: boolean }) {
  return (
    <span
      className={`presence-avatar${compact ? " presence-avatar--compact" : ""}${entry.online ? " presence-avatar--online" : ""}`}
      style={{ "--avatar-hue": avatarHue(entry.username) } as CSSProperties}
      aria-hidden="true"
    >
      {entry.username.charAt(0).toUpperCase()}
    </span>
  );
}

export function PresencePanel({ users, open, onToggle }: PresencePanelProps) {
  const onlineUsers = users.filter((entry) => entry.online);
  const onlineCount = onlineUsers.length;

  return (
    <>
      <button
        type="button"
        className="presence-trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Кто онлайн: ${onlineCount}`}
        title={onlineUsers.map((entry) => `${entry.username} — ${describePresence(entry)}`).join("\n")}
        onClick={onToggle}
      >
        {onlineCount > 0 ? (
          <span className="presence-trigger__avatars">
            {onlineUsers.slice(0, TRIGGER_AVATAR_LIMIT).map((entry) => (
              <PresenceAvatar key={entry.id} entry={entry} compact />
            ))}
          </span>
        ) : null}
        <span className="presence-trigger__count">
          <span className="presence-panel__pulse" aria-hidden="true" />
          {onlineCount}
        </span>
      </button>

      {open ? (
        <div className="presence-panel" role="dialog" aria-label="Кто онлайн">
          <p className="presence-panel__title">
            Сейчас на сайте <span className="presence-panel__count">{onlineCount}</span>
          </p>
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
        </div>
      ) : null}
    </>
  );
}
