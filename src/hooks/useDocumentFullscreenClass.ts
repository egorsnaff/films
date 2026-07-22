import { useEffect } from "react";

function isDocumentFullscreen(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };

  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

/**
 * Toggles a class on <html> while the document (or an embedded iframe) is
 * in the Fullscreen API. Cross-origin player UIs that fake fullscreen with CSS
 * never notify the parent — those cursors cannot be styled from our app.
 */
export function useDocumentFullscreenClass(className: string): void {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      root.classList.toggle(className, isDocumentFullscreen());
    };

    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);

    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      root.classList.remove(className);
    };
  }, [className]);
}
