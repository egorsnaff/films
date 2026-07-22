import { useEffect } from "react";

import { prefersReducedMotion } from "../lib/motion";

type CursorGlowProps = {
  /** Hide the custom cursor (e.g. on the watch page / over a player). */
  disabled?: boolean;
};

function isDocumentFullscreen(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };

  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function CursorGlow({ disabled = false }: CursorGlowProps) {
  useEffect(() => {
    const root = document.documentElement;

    if (disabled || prefersReducedMotion()) {
      root.classList.remove("cursor-active");
      root.classList.remove("is-player-fullscreen");
      return;
    }

    const hasFinePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!hasFinePointer) {
      return;
    }

    let frameId = 0;
    let targetX = 50;
    let targetY = 42;
    let currentX = targetX;
    let currentY = targetY;
    let fullscreen = isDocumentFullscreen();

    const setFullscreenState = (next: boolean) => {
      fullscreen = next;
      root.classList.toggle("is-player-fullscreen", next);
      if (next) {
        root.classList.remove("cursor-active");
      }
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.14;
      currentY += (targetY - currentY) * 0.14;

      root.style.setProperty("--cursor-x", `${currentX}%`);
      root.style.setProperty("--cursor-y", `${currentY}%`);
      root.style.setProperty("--cursor-x-px", `${(currentX / 100) * window.innerWidth}px`);
      root.style.setProperty("--cursor-y-px", `${(currentY / 100) * window.innerHeight}px`);

      if (Math.abs(targetX - currentX) > 0.04 || Math.abs(targetY - currentY) > 0.04) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        frameId = 0;
      }
    };

    const queueTick = () => {
      if (!frameId) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    const handleMove = (event: MouseEvent) => {
      if (fullscreen) {
        return;
      }

      targetX = (event.clientX / window.innerWidth) * 100;
      targetY = (event.clientY / window.innerHeight) * 100;
      root.classList.add("cursor-active");
      queueTick();
    };

    const handleLeave = () => {
      root.classList.remove("cursor-active");
    };

    const handleFullscreenChange = () => {
      setFullscreenState(isDocumentFullscreen());
    };

    root.style.setProperty("--cursor-x", `${currentX}%`);
    root.style.setProperty("--cursor-y", `${currentY}%`);
    setFullscreenState(fullscreen);

    window.addEventListener("mousemove", handleMove, { passive: true });
    window.addEventListener("mouseleave", handleLeave);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      root.classList.remove("cursor-active");
      root.classList.remove("is-player-fullscreen");
    };
  }, [disabled]);

  if (disabled) {
    return null;
  }

  return (
    <>
      <div className="cursor-glow cursor-glow--ambient" aria-hidden="true" />
      <div className="cursor-glow cursor-glow--core" aria-hidden="true" />
    </>
  );
}
