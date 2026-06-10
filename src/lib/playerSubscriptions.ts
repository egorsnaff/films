const PLAYER_JS_LISTENERS = ["play", "timeupdate", "ended", "finish"] as const;

export function subscribeIframeToPlayerEvents(iframe: HTMLIFrameElement): void {
  const target = iframe.contentWindow;
  if (!target) {
    return;
  }

  for (const eventName of PLAYER_JS_LISTENERS) {
    try {
      target.postMessage(
        JSON.stringify({
          context: "player.js",
          method: "addEventListener",
          value: eventName
        }),
        "*"
      );
    } catch {
      // Cross-origin embeds may reject postMessage until the player is ready.
    }
  }

  const kodikSubscribe = JSON.stringify({
    key: "kodik_player_api",
    method: "listen",
    value: ["time", "mediaEnded"]
  });

  try {
    target.postMessage(kodikSubscribe, "*");
  } catch {
    // Ignore Kodik-specific subscription failures on non-Kodik players.
  }
}
