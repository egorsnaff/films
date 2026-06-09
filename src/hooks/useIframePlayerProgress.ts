import { useEffect } from "react";

import { isAllowedPlayerMessageOrigin } from "../lib/playerOrigins";
import { parsePlayerProgressMessage } from "../lib/playerProgress";
import { subscribeIframeToPlayerEvents } from "../lib/playerSubscriptions";

type UseIframePlayerProgressOptions = {
  enabled: boolean;
  iframe: HTMLIFrameElement | null;
  onProgress: (input: { currentTime: number; duration?: number; ended?: boolean }) => void;
};

export function useIframePlayerProgress({
  enabled,
  iframe,
  onProgress
}: UseIframePlayerProgressOptions): void {
  useEffect(() => {
    if (!enabled || !iframe) {
      return;
    }

    const iframeSrc = iframe.src;

    const handleMessage = (event: MessageEvent) => {
      const fromDirectIframe = event.source === iframe.contentWindow;
      const fromAllowedOrigin = isAllowedPlayerMessageOrigin(event.origin, iframeSrc);

      if (!fromDirectIframe && !fromAllowedOrigin) {
        return;
      }

      const progress = parsePlayerProgressMessage(event.data);
      if (!progress) {
        return;
      }

      onProgress(progress);
    };

    const subscribe = () => subscribeIframeToPlayerEvents(iframe);

    subscribe();
    const retryTimer = window.setInterval(subscribe, 4_000);
    window.addEventListener("message", handleMessage);

    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener("message", handleMessage);
    };
  }, [enabled, iframe, onProgress]);
}
