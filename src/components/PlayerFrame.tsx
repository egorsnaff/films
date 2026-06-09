import { useRef, useState } from "react";

import { useIframePlayerProgress } from "../hooks/useIframePlayerProgress";

type PlayerFrameProps = {
  title: string;
  src: string;
  trackProgress?: boolean;
  onPlaybackStarted?: () => void;
  onPlayerProgress?: (input: { currentTime: number; duration?: number; ended?: boolean }) => void;
};

export function PlayerFrame({
  title,
  src,
  trackProgress = false,
  onPlaybackStarted,
  onPlayerProgress
}: PlayerFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeElement, setIframeElement] = useState<HTMLIFrameElement | null>(null);

  useIframePlayerProgress({
    enabled: trackProgress,
    iframe: iframeElement,
    onProgress: (progress) => onPlayerProgress?.(progress)
  });

  return (
    <iframe
      ref={(node) => {
        iframeRef.current = node;
        setIframeElement(node);
      }}
      key={src}
      title={title}
      src={src}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      onLoad={() => onPlaybackStarted?.()}
    />
  );
}
