import { useMemo, useState } from "react";

import type { PlayerSource } from "../lib/playerSources";

type MoviePlayersProps = {
  players: PlayerSource[];
};

export function MoviePlayers({ players }: MoviePlayersProps) {
  const safePlayers = useMemo(() => players.filter(hasSafeEmbedUrl), [players]);
  const [activePlayerId, setActivePlayerId] = useState<string | undefined>(
    safePlayers.at(0)?.id
  );
  const activePlayer =
    safePlayers.find((player) => player.id === activePlayerId) ?? safePlayers.at(0);

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
        <iframe
          key={activePlayer.id}
          title={activePlayer.title}
          src={activePlayer.embedUrl}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
        />
      </div>
    </section>
  );
}

function hasSafeEmbedUrl(player: PlayerSource): boolean {
  try {
    const url = new URL(player.embedUrl);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
