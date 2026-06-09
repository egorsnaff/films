const PLAYER_ORIGIN_SUFFIXES = [
  "newplayjj.com",
  "kodik.cc",
  "kodik.info",
  "kodik.biz",
  "kinohost.web.app",
  "api.atomics.ws",
  "lumex.space",
  "bhcesh.me",
  "collaps.kg",
  "apivb.com",
  "kodikapi.com"
] as const;

export function getIframeOrigin(src: string): string | null {
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}

export function isKnownPlayerOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return PLAYER_ORIGIN_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function isAllowedPlayerMessageOrigin(origin: string, iframeSrc: string): boolean {
  const iframeOrigin = getIframeOrigin(iframeSrc);
  if (iframeOrigin && origin === iframeOrigin) {
    return true;
  }

  return isKnownPlayerOrigin(origin);
}
