import { useEffect, useMemo, useState } from "react";

import { KinoboxPlayerPanel } from "./KinoboxPlayerPanel";
import { PlayerFrame } from "./PlayerFrame";
import type { PlayerResolveOptions, PlayerSource } from "../lib/playerSources";

type MoviePlayersProps = {
  players: PlayerSource[];
  resolveOptions?: PlayerResolveOptions;
  trackProgress?: boolean;
  onPlaybackStarted?: () => void;
  onPlayerProgress?: (input: { currentTime: number; duration?: number; ended?: boolean }) => void;
};

export function MoviePlayers({
  players,
  resolveOptions,
  trackProgress = false,
  onPlaybackStarted,
  onPlayerProgress
}: MoviePlayersProps) {
  const safePlayers = useMemo(() => players.filter(hasSafeEmbedUrl), [players]);
  const primaryPlayer = safePlayers.at(0);
  const fallbackPlayers = safePlayers.slice(1);
  const [activePlayerId, setActivePlayerId] = useState<string | undefined>(primaryPlayer?.id);
  const [showFallbacks, setShowFallbacks] = useState(false);
  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [loadingPlayerId, setLoadingPlayerId] = useState<string | null>(null);
  const [failedPlayerIds, setFailedPlayerIds] = useState<Record<string, true>>({});
  const activePlayer =
    safePlayers.find((player) => player.id === activePlayerId) ?? primaryPlayer;
  const activeEmbedUrl = activePlayer
    ? activePlayer.embedUrl ?? resolvedUrls[activePlayer.id]
    : undefined;

  useEffect(() => {
    if (!safePlayers.some((player) => player.id === activePlayerId)) {
      setActivePlayerId(primaryPlayer?.id);
    }
  }, [activePlayerId, primaryPlayer?.id, safePlayers]);

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

  function selectPlayer(playerId: string) {
    setActivePlayerId(playerId);
    setShowFallbacks(false);
  }

  if (!activePlayer) {
    return <p className="empty-state">Плееры пока недоступны</p>;
  }

  return (
    <section className="players" aria-label="Плееры">
      <div className="player-toolbar">
        <span className="player-toolbar__active">
          <span className="player-toolbar__label">Плеер</span>
          <strong>{activePlayer.title}</strong>
        </span>
        {fallbackPlayers.length > 0 ? (
          <button
            type="button"
            className="player-fallback-toggle"
            aria-expanded={showFallbacks}
            aria-controls="player-fallback-panel"
            onClick={() => setShowFallbacks((current) => !current)}
          >
            Запасные плееры
            <span className="player-fallback-toggle__count">{fallbackPlayers.length}</span>
          </button>
        ) : null}
      </div>

      {showFallbacks && fallbackPlayers.length > 0 ? (
        <div
          id="player-fallback-panel"
          className="player-fallback-panel"
          role="group"
          aria-label="Запасные плееры"
        >
          {safePlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              className="player-tab player-tab--fallback"
              aria-pressed={player.id === activePlayer.id}
              onClick={() => selectPlayer(player.id)}
            >
              {player.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="player-frame-wrap">
        {activePlayer.resolveKinoboxPlayers ? (
          <KinoboxPlayerPanel
            resolvePlayers={activePlayer.resolveKinoboxPlayers}
            kinopoiskId={activePlayer.kinopoiskId}
            embedFallback={activePlayer.kinoboxEmbedFallback}
            resolveOptions={resolveOptions}
            trackProgress={trackProgress}
            onPlaybackStarted={onPlaybackStarted}
            onPlayerProgress={onPlayerProgress}
          />
        ) : loadingPlayerId === activePlayer.id ? (
          <p className="player-status">Загрузка плеера...</p>
        ) : activeEmbedUrl ? (
          <PlayerFrame
            title={activePlayer.title}
            src={activeEmbedUrl}
            trackProgress={trackProgress}
            onPlaybackStarted={onPlaybackStarted}
            onPlayerProgress={onPlayerProgress}
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
