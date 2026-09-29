import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "../lib/motion";

type CursorGlowProps = {
  /** Hide the custom cursor (e.g. on the watch page / over a player). */
  disabled?: boolean;
};

const SPOTLIGHT_SELECTOR =
  ".topbar, .film-card, .film-shelf__card, .collection-card, .watch-hero, .load-more-button, .interactive-surface";

function isDocumentFullscreen(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };

  return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement);
}

// Позиция пишется в transform слоёв и в переменные только наведённого элемента:
// переменные на <html> заставляли браузер пересчитывать стили всей страницы на каждом кадре.
export function CursorGlow({ disabled = false }: CursorGlowProps) {
  const ambientRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;

    if (disabled || prefersReducedMotion()) {
      root.classList.remove("cursor-active");
      return;
    }

    const hasFinePointer =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!hasFinePointer) {
      return;
    }

    let frameId = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight * 0.42;
    let currentX = targetX;
    let currentY = targetY;
    let pointerX = targetX;
    let pointerY = targetY;
    let spotlight: HTMLElement | null = null;

    const moveLayers = () => {
      const transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
      if (ambientRef.current) {
        ambientRef.current.style.transform = transform;
      }
      if (coreRef.current) {
        coreRef.current.style.transform = transform;
      }
    };

    const updateSpotlight = () => {
      if (!spotlight) {
        return;
      }

      const rect = spotlight.getBoundingClientRect();
      spotlight.style.setProperty("--spot-x", `${pointerX - rect.left}px`);
      spotlight.style.setProperty("--spot-y", `${pointerY - rect.top}px`);
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.14;
      currentY += (targetY - currentY) * 0.14;
      moveLayers();
      updateSpotlight();

      if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
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
      // Fullscreen class is owned by useDocumentFullscreenClass; skip glow there.
      if (isDocumentFullscreen()) {
        root.classList.remove("cursor-active");
        return;
      }

      targetX = event.clientX;
      targetY = event.clientY;
      pointerX = event.clientX;
      pointerY = event.clientY;

      const nextSpotlight =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(SPOTLIGHT_SELECTOR)
          : null;
      if (nextSpotlight !== spotlight) {
        spotlight?.style.removeProperty("--spot-x");
        spotlight?.style.removeProperty("--spot-y");
        spotlight = nextSpotlight;
      }

      root.classList.add("cursor-active");
      queueTick();
    };

    const handleLeave = () => {
      root.classList.remove("cursor-active");
    };

    moveLayers();

    window.addEventListener("mousemove", handleMove, { passive: true });
    window.addEventListener("mouseleave", handleLeave);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      spotlight?.style.removeProperty("--spot-x");
      spotlight?.style.removeProperty("--spot-y");
      root.classList.remove("cursor-active");
    };
  }, [disabled]);

  if (disabled) {
    return null;
  }

  return (
    <>
      <div ref={ambientRef} className="cursor-glow cursor-glow--ambient" aria-hidden="true" />
      <div ref={coreRef} className="cursor-glow cursor-glow--core" aria-hidden="true" />
    </>
  );
}
