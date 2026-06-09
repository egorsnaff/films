export type PlayerProgressEvent = {
  currentTime: number;
  duration?: number;
  ended?: boolean;
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseJsonMessage(data: unknown): Record<string, unknown> | null {
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  if (typeof data === "object" && data !== null) {
    return data as Record<string, unknown>;
  }

  return null;
}

export function parsePlayerProgressMessage(data: unknown): PlayerProgressEvent | null {
  const message = parseJsonMessage(data);

  if (!message) {
    return null;
  }

  const event = typeof message.event === "string" ? message.event : undefined;
  const type = typeof message.type === "string" ? message.type : undefined;
  const key = typeof message.key === "string" ? message.key : undefined;

  if (event === "timeupdate" || type === "timeupdate" || event === "time" || type === "time") {
    const valueObject =
      typeof message.value === "object" && message.value !== null
        ? (message.value as Record<string, unknown>)
        : null;
    const payloadObject =
      typeof message.payload === "object" && message.payload !== null
        ? (message.payload as Record<string, unknown>)
        : null;

    const currentTime = toNumber(
      message.time ??
        message.currentTime ??
        message.seconds ??
        valueObject?.seconds ??
        valueObject?.time ??
        valueObject?.currentTime ??
        payloadObject?.time ??
        payloadObject?.currentTime ??
        (typeof message.value === "number" || typeof message.value === "string"
          ? message.value
          : undefined) ??
        message.data
    );
    if (currentTime === undefined) {
      return null;
    }

    return {
      currentTime,
      duration: toNumber(
        message.duration ??
          valueObject?.duration ??
          payloadObject?.duration ??
          message.total
      )
    };
  }

  if (key === "kodik_player_time_update" || key === "kodik_player_media_ended") {
    const currentTime = toNumber(message.value ?? message.time);
    if (key === "kodik_player_media_ended") {
      return {
        currentTime: currentTime ?? 0,
        duration: toNumber(message.duration),
        ended: true
      };
    }

    if (currentTime === undefined) {
      return null;
    }

    return {
      currentTime,
      duration: toNumber(message.duration)
    };
  }

  if (
    event === "ended" ||
    type === "ended" ||
    type === "playbackfinished" ||
    event === "finish" ||
    event === "complete"
  ) {
    const currentTime = toNumber(message.time ?? message.currentTime ?? message.duration);
    const duration = toNumber(message.duration);

    return {
      currentTime: currentTime ?? duration ?? 0,
      duration,
      ended: true
    };
  }

  if (type === "play" && message.payload && typeof message.payload === "object") {
    const payload = message.payload as Record<string, unknown>;
    const currentTime = toNumber(payload.time ?? payload.currentTime);
    if (currentTime !== undefined) {
      return { currentTime, duration: toNumber(payload.duration) };
    }
  }

  if (event === "infoDelivery" && message.info && typeof message.info === "object") {
    const info = message.info as Record<string, unknown>;
    const currentTime = toNumber(info.currentTime);
    if (currentTime !== undefined) {
      return {
        currentTime,
        duration: toNumber(info.duration)
      };
    }
  }

  if (message.context === "player.js" && event === "timeupdate" && message.value) {
    const value = message.value;
    if (typeof value === "object" && value !== null) {
      const progress = value as Record<string, unknown>;
      const currentTime = toNumber(progress.seconds ?? progress.time ?? progress.currentTime);
      if (currentTime !== undefined) {
        return {
          currentTime,
          duration: toNumber(progress.duration)
        };
      }
    }
  }

  return null;
}
