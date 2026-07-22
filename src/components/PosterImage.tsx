import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

import { normalizeClientPosterUrl } from "../lib/kinopoisk";

type PosterImageProps = {
  src: string;
  alt: string;
  className?: string;
} & Pick<ImgHTMLAttributes<HTMLImageElement>, "loading" | "decoding">;

export function PosterImage({
  src,
  alt,
  className = "",
  loading = "lazy",
  decoding = "async"
}: PosterImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const resolvedSrc = normalizeClientPosterUrl(src) ?? src;

  useEffect(() => {
    setStatus("loading");
  }, [resolvedSrc]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const syncFromElement = () => {
      if (!image.complete) {
        return;
      }

      setStatus(image.naturalWidth > 0 && image.naturalHeight > 0 ? "loaded" : "error");
    };

    syncFromElement();
    image.addEventListener("load", syncFromElement);
    return () => image.removeEventListener("load", syncFromElement);
  }, [resolvedSrc]);

  return (
    <span
      className={`poster-image${status === "loaded" ? " poster-image--loaded" : ""}${
        status === "error" ? " poster-image--error" : ""
      }`}
      data-poster-state={status}
    >
      <span className="poster-image__stage" aria-hidden="true">
        <span className="poster-image__glow" />
        <span className="poster-image__grain" />
        <span className="poster-image__shimmer" />
        <span className="poster-image__perfs poster-image__perfs--left" />
        <span className="poster-image__perfs poster-image__perfs--right" />
        <span className="poster-image__mark">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M5 24c4.2-9.8 8.4-13.8 11-13.8s6.8 4 11 13.8"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <circle cx="16" cy="10.8" r="1.8" fill="currentColor" />
          </svg>
        </span>
      </span>

      <img
        ref={imageRef}
        className={`poster-image__img ${className}`.trim()}
        src={resolvedSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
      />
    </span>
  );
}
