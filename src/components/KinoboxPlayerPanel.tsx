import { useEffect, useState } from "react";

import type { KinoboxPlayerOption, PlayerResolveOptions } from "../lib/playerSources";
import {
  buildKinoboxEmbedFallbackUrl,
  formatKinoboxPlayerLabel
} from "../lib/playerSources";
import { PlayerFrame } from "./PlayerFrame";

type KinoboxPlayerPanelProps = {
  resolvePlayers: (options?: PlayerResolveOptions) => Promise<KinoboxPlayerOption[]>;
  kinopoiskId?: number;
  embedFallback?: string;
  resolveOptions?: PlayerResolveOptions;
  trackProgress?: boolean;
  onPlaybackStarted?: () => void;
  onPlayerProgress?: (input: { currentTime: number; duration?: number; ended?: boolean }) => void;
};

export function KinoboxPlayerPanel({
  resolvePlayers,
  kinopoiskId,
  embedFallback,
  resolveOptions,
  trackProgress = false,
  onPlaybackStarted,
  onPlayerProgress
}: KinoboxPlayerPanelProps) {
  const fallbackUrl =
    embedFallback ??
    (kinopoiskId
      ? buildKinoboxEmbedFallbackUrl(kinopoiskId, resolveOptions?.embedDomain)
      : undefined);
  const [sources, setSources] = useState<KinoboxPlayerOption[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | undefined>();
  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeSource =
    sources.find((source) => source.id === activeSourceId) ?? sources.at(0);
  const activeEmbedUrl = activeSource?.iframeUrl ?? fallbackUrl;

  useEffect(() => {
    let cancelled = false;

    async function loadSources() {
      setStatus("loading");
      setErrorMessage(null);
      setSources([]);
      setActiveSourceId(undefined);

      try {
        const nextSources = await resolvePlayers(resolveOptions);

        if (cancelled) {
          return;
        }

        setSources(nextSources);
        setActiveSourceId(nextSources.at(0)?.id);
        setStatus(nextSources.length > 0 || fallbackUrl ? "success" : "error");
        if (nextSources.length === 0 && !fallbackUrl) {
          setErrorMessage("Источники Kinobox не найдены");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus(fallbackUrl ? "success" : "error");
        setErrorMessage(
          error instanceof Error ? error.message : "Не удалось загрузить Kinobox"
        );
      }
    }

    void loadSources();

    return () => {
      cancelled = true;
    };
  }, [fallbackUrl, resolveOptions, resolvePlayers]);

  if (status === "loading") {
    return <p className="player-status">Загружаем источники Kinobox...</p>;
  }

  if (!activeEmbedUrl) {
    return <p className="player-status">{errorMessage ?? "Плеер не найден"}</p>;
  }

  return (
    <div className="kinobox-panel">
      {sources.length > 0 ? (
        <div className="kinobox-panel__tabs" role="group" aria-label="Источники Kinobox">
          {sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className="kinobox-panel__tab"
              aria-pressed={source.id === activeSource?.id}
              onClick={() => setActiveSourceId(source.id)}
            >
              {formatKinoboxPlayerLabel(source)}
            </button>
          ))}
        </div>
      ) : (
        <p className="kinobox-panel__hint">
          {errorMessage
            ? "Открываем встроенную страницу Kinobox."
            : "Источники Kinobox недоступны."}
        </p>
      )}

      <div className="kinobox-panel__frame player-frame-wrap">
        <PlayerFrame
          title={activeSource ? formatKinoboxPlayerLabel(activeSource) : "Kinobox"}
          src={activeEmbedUrl}
          trackProgress={trackProgress}
          onPlaybackStarted={onPlaybackStarted}
          onPlayerProgress={onPlayerProgress}
        />
      </div>
    </div>
  );
}
