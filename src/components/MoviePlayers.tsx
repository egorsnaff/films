import { useEffect, useMemo, useState } from "react";

import { KinoboxPlayerPanel } from "./KinoboxPlayerPanel";
import type { PlayerResolveOptions, PlayerSource } from "../lib/playerSources";

type MoviePlayersProps = {
  players: PlayerSource[];
  resolveOptions?: PlayerResolveOptions;
};

export function MoviePlayers({ players, resolveOptions }: MoviePlayersProps) {
  const safePlayers = useMemo(() => players.filter(hasSafeEmbedUrl), [players]);
  const [activePlayerId, setActivePlayerId] = useState<string | undefined>(
    safePlayers.at(0)?.id
  );
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null);
  const [failedPlayerIds, setFailedPlayerIds] = useState<Record<string, true>>({});
  const activePlayer =
    safePlayers.find((player) => player.id === activePlayerId) ?? safePlayers.at(0);
  const activeEmbedUrl = activePlayer
    ? activePlayer.embedUrl ?? resolvedUrls[activePlayer.id]
    : undefined;

  useEffect(() => {
    if (!safePlayers.some((player) => player.id === activePlayerId)) {
      setActivePlayerId(safePlayers.at(0)?.id);
    }
  }, [activePlayerId, safePlayers]);

  useEffect(() => {
    let cancelled = false;

    async function resolveActivePlayer() {
      if (
        !activePlayer ||
        activePlayer.embedUrl ||
        activePlayer.resolveKinoboxPlayers ||
        !activePlayer.resolveEmbedUrl
      ) {
        return;
      }

      if (resolvedUrls[activePlayer.id] || failedPlayerIds[activePlayer.id]) {
        return;
      }

      setLoadingPlayerId(activePlayer.id);

      try {
        const nextUrl = await activePlayer.resolveEmbedUrl(resolveOptions);

        if (cancelled) {
          return;
        }

        if (nextUrl && isSafeUrl(nextUrl)) {
          setResolvedUrls((current) => ({
            ...current,
            [activePlayer.id]: nextUrl
          }));
        } else {
          setFailedPlayerIds((current) => ({ ...current, [activePlayer.id]: true }));
        }
      } catch {
        if (!cancelled) {
          setFailedPlayerIds((current) => ({ ...current, [activePlayer.id]: true }));
        }
      } finally {
        if (!cancelled) {
          setLoadingPlayerId(null);
        }
      }
    }

    void resolveActivePlayer();

    return () => {
      cancelled = true;
    };
  }, [activePlayer, failedPlayerIds, resolveOptions, resolvedUrls]);

  if (!activePlayer) {
    return <p className="empty-state">Плееры пока недоступны</p>;
  }

  return (
    <section className="players" aria-label="Плееры">
      <div className="player-tabs" role="group" aria-label="Выбор плеера">
        {safePlayers.map((player) => (
          <button
            key={player.id}
            type="button"
            className="player-tab"
            aria-pressed={player.id === activePlayer.id}
            onClick={() => setActivePlayerId(player.id)}
          >
            {player.title}
          </button>
        ))}
      </div>
      <div className="player-frame-wrap">
        {activePlayer.resolveKinoboxPlayers ? (
          <KinoboxPlayerPanel
            resolvePlayers={activePlayer.resolveKinoboxPlayers}
            kinopoiskId={activePlayer.kinopoiskId}
            embedFallback={activePlayer.kinoboxEmbedFallback}
            resolveOptions={resolveOptions}
          />
        ) : loadingPlayerId === activePlayer.id ? (
          <p className="player-status">Загрузка плеера...</p>
        ) : activeEmbedUrl ? (
          <iframe
            key={activePlayer.id}
            title={activePlayer.title}
            src={activeEmbedUrl}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <p className="player-status">Плеер не найден</p>
        )}
      </div>
    </section>
  );
}

function hasSafeEmbedUrl(player: PlayerSource): boolean {
  if (player.resolveKinoboxPlayers) {
    return true;
  }

  if (player.resolveEmbedUrl) {
    return true;
  }

  if (!player.embedUrl) {
    return false;
  }

  return isSafeUrl(player.embedUrl);
}

function isSafeUrl(embedUrl: string): boolean {
  try {
    const url = new URL(embedUrl);

    return url.protocol === "https:";
  } catch {
    return false;
  }
}
