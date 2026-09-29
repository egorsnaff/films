import type { FilmAwardSummaryChip } from "./filmAwards.js";
import type { CachedFilm } from "./kpCache.js";
import type { SharedListMember } from "./sharedList.js";

export type BotFilm = CachedFilm & { isSeries?: boolean };

type TelegramChat = { id: number };
type TelegramUser = { id: number };

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: TelegramChat;
    from?: TelegramUser;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { message_id: number; chat: TelegramChat };
  };
};

export type TelegramApi = {
  call<T = unknown>(method: string, payload?: Record<string, unknown>): Promise<T>;
};

type InlineButton = { text: string; callback_data: string };
type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export type TelegramBotDeps = {
  api: TelegramApi;
  members: SharedListMember[];
  // Telegram user id → логин на сайте.
  telegramUsers: Map<number, string>;
  siteUrl: string;
  searchFilms(query: string): Promise<CachedFilm[]>;
  getFilm(kinopoiskId: number): Promise<BotFilm>;
  getAwards(kinopoiskId: number): Promise<FilmAwardSummaryChip[]>;
  addToPlan(username: string, kinopoiskId: number): boolean;
};

const SHARED_TARGET = "shared";
const ALTERNATIVES_LIMIT = 6;
const QUERY_MAX_LENGTH = 100;
const PHOTO_CAPTION_LIMIT = 1024;
const MESSAGE_LIMIT = 4096;
const AWARDS_LINE_LIMIT = 3;

export function parseTelegramUsers(raw: string | undefined): Map<number, string> {
  const users = new Map<number, string>();

  for (const entry of (raw ?? "").split(",")) {
    const [username, id] = entry.split(":").map((part) => part.trim());
    const telegramId = Number(id);
    if (username && Number.isSafeInteger(telegramId) && telegramId > 0) {
      users.set(telegramId, username);
    }
  }

  return users;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function pluralize(count: number, forms: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }
  return forms[2];
}

function formatAward(chip: FilmAwardSummaryChip): string {
  if (chip.wins > 0) {
    return `${chip.name} — ${chip.wins} ${pluralize(chip.wins, ["победа", "победы", "побед"])}`;
  }
  return `${chip.name} — ${chip.nominations} ${pluralize(chip.nominations, ["номинация", "номинации", "номинаций"])}`;
}

export function buildFilmUrl(siteUrl: string, kinopoiskId: number): string {
  return `${siteUrl.replace(/\/+$/, "")}/watch/${kinopoiskId}`;
}

function truncateEscaped(text: string, budget: number): string {
  if (budget <= 1) {
    return "";
  }

  let length = Math.min(text.length, budget);
  while (length > 0) {
    const cut = length < text.length ? `${text.slice(0, length).trimEnd()}…` : text;
    const escaped = escapeHtml(cut);
    if (escaped.length <= budget) {
      return escaped;
    }
    length -= escaped.length - budget;
  }

  return "";
}

export function formatFilmCaption(
  film: BotFilm,
  awards: FilmAwardSummaryChip[],
  siteUrl: string,
  limit = PHOTO_CAPTION_LIMIT
): string {
  const title = film.year ? `${film.title} (${film.year})` : film.title;
  const head = [`<b>${escapeHtml(title)}</b>`];

  if (film.originalTitle && film.originalTitle !== film.title) {
    head.push(`<i>${escapeHtml(film.originalTitle)}</i>`);
  }

  const facts = [
    film.isSeries ? "сериал" : null,
    film.genres?.length ? film.genres.join(", ") : null,
    film.filmLengthMinutes ? `${film.filmLengthMinutes} мин` : null
  ].filter(Boolean);
  if (facts.length > 0) {
    head.push(escapeHtml(facts.join(" · ")));
  }

  const ratings = [
    film.rating ? `КП ${film.rating}` : null,
    film.imdbRating ? `IMDb ${film.imdbRating}` : null
  ].filter(Boolean);
  if (ratings.length > 0) {
    head.push(`⭐ ${ratings.join(" · ")}`);
  }

  const topAwards = awards.slice(0, AWARDS_LINE_LIMIT).map(formatAward);
  if (topAwards.length > 0) {
    head.push(`🏆 ${escapeHtml(topAwards.join(" · "))}`);
  }

  const link = `<a href="${escapeHtml(buildFilmUrl(siteUrl, film.kinopoiskId))}">Смотреть на сайте</a>`;
  const headText = head.join("\n");
  const description = film.description?.trim();

  if (!description) {
    return `${headText}\n\n${link}`;
  }

  const budget = limit - headText.length - link.length - 4;
  const body = truncateEscaped(description, budget);
  return body ? `${headText}\n\n${body}\n\n${link}` : `${headText}\n\n${link}`;
}

export function buildFilmKeyboard(
  kinopoiskId: number,
  senderUsername: string,
  members: SharedListMember[],
  hasAlternatives: boolean
): InlineKeyboard {
  const personal: InlineButton[] = [
    { text: "➕ Мне", callback_data: `add:${kinopoiskId}:${senderUsername}` },
    ...members
      .filter((member) => member.username !== senderUsername)
      .map((member) => ({
        text: `➕ ${member.dative}`,
        callback_data: `add:${kinopoiskId}:${member.username}`
      }))
  ];

  const rows: InlineButton[][] = [personal];
  if (members.some((member) => member.username === senderUsername)) {
    rows.push([{ text: "➕ В общий список", callback_data: `add:${kinopoiskId}:${SHARED_TARGET}` }]);
  }
  if (hasAlternatives) {
    rows.push([{ text: "Не тот? Другие варианты", callback_data: "alts" }]);
  }

  return { inline_keyboard: rows };
}

export type BotCallback =
  | { kind: "add"; kinopoiskId: number; target: string }
  | { kind: "show"; kinopoiskId: number }
  | { kind: "alts" };

export function parseCallbackData(data: string | undefined): BotCallback | null {
  if (data === "alts") {
    return { kind: "alts" };
  }

  const [kind, rawId, target] = (data ?? "").split(":");
  const kinopoiskId = Number(rawId);
  if (!Number.isSafeInteger(kinopoiskId) || kinopoiskId <= 0) {
    return null;
  }
  if (kind === "show") {
    return { kind: "show", kinopoiskId };
  }
  if (kind === "add" && target) {
    return { kind: "add", kinopoiskId, target };
  }
  return null;
}

function helpText(): string {
  return [
    "Пришли название фильма или сериала — покажу карточку с описанием, жанром, наградами и ссылкой.",
    "Под карточкой кнопки: добавить в «Буду смотреть» тебе, другому или в общий список.",
    "Если нашлось не то, нажми «Другие варианты» или добавь к названию год."
  ].join("\n\n");
}

export function createTelegramBot(deps: TelegramBotDeps) {
  const { api, members, telegramUsers, siteUrl } = deps;
  const lastResults = new Map<number, CachedFilm[]>();

  function send(chatId: number, text: string, replyMarkup?: InlineKeyboard) {
    return api.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    });
  }

  async function sendFilmCard(chatId: number, kinopoiskId: number, senderUsername: string) {
    let film: BotFilm;
    try {
      film = await deps.getFilm(kinopoiskId);
    } catch {
      await send(chatId, "Не получилось загрузить карточку фильма, попробуй ещё раз чуть позже.");
      return;
    }

    const awards = await deps.getAwards(kinopoiskId).catch(() => []);
    const hasAlternatives = (lastResults.get(chatId)?.length ?? 0) > 1;
    const keyboard = buildFilmKeyboard(kinopoiskId, senderUsername, members, hasAlternatives);

    if (film.posterUrl) {
      try {
        await api.call("sendPhoto", {
          chat_id: chatId,
          photo: film.posterUrl,
          caption: formatFilmCaption(film, awards, siteUrl, PHOTO_CAPTION_LIMIT),
          parse_mode: "HTML",
          reply_markup: keyboard
        });
        return;
      } catch {
        // Telegram не смог скачать постер — отправим карточку текстом.
      }
    }

    await send(chatId, formatFilmCaption(film, awards, siteUrl, MESSAGE_LIMIT), keyboard);
  }

  async function handleText(chatId: number, username: string, text: string) {
    if (text.startsWith("/")) {
      await send(chatId, helpText());
      return;
    }

    const query = text.slice(0, QUERY_MAX_LENGTH);
    await api.call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);

    let films: CachedFilm[];
    try {
      films = await deps.searchFilms(query);
    } catch {
      await send(chatId, "Поиск сейчас не отвечает, попробуй ещё раз чуть позже.");
      return;
    }

    if (films.length === 0) {
      await send(chatId, `Ничего не нашёл по запросу «${escapeHtml(query)}». Попробуй иначе или добавь год.`);
      return;
    }

    lastResults.set(chatId, films.slice(0, ALTERNATIVES_LIMIT));
    await sendFilmCard(chatId, films[0].kinopoiskId, username);
  }

  function describeTarget(target: string, senderUsername: string): string {
    if (target === SHARED_TARGET) {
      return "в общий список";
    }
    if (target === senderUsername) {
      return "тебе в «Буду смотреть»";
    }
    const member = members.find((entry) => entry.username === target);
    return `${member?.dative ?? target} в «Буду смотреть»`;
  }

  async function notifyOthers(
    usernames: string[],
    senderUsername: string,
    film: BotFilm | null,
    kinopoiskId: number,
    isShared: boolean
  ) {
    const title = film ? `«${escapeHtml(film.title)}»` : "фильм";
    const link = `<a href="${escapeHtml(buildFilmUrl(siteUrl, kinopoiskId))}">${title}</a>`;
    const text = isShared
      ? `${escapeHtml(senderUsername)} добавил ${link} в общий список`
      : `${escapeHtml(senderUsername)} добавил тебе ${link} в «Буду смотреть»`;

    for (const [telegramId, username] of telegramUsers) {
      if (username !== senderUsername && usernames.includes(username)) {
        await send(telegramId, text).catch(() => undefined);
      }
    }
  }

  async function handleAdd(
    chatId: number,
    callbackId: string,
    senderUsername: string,
    kinopoiskId: number,
    target: string
  ) {
    const isShared = target === SHARED_TARGET;
    const isMember = members.some((member) => member.username === target);
    if ((isShared && !members.some((member) => member.username === senderUsername)) ||
      (!isShared && target !== senderUsername && !isMember)) {
      await api.call("answerCallbackQuery", { callback_query_id: callbackId, text: "Так нельзя" });
      return;
    }

    const usernames = isShared ? members.map((member) => member.username) : [target];
    const added = usernames.filter((username) => deps.addToPlan(username, kinopoiskId));
    if (added.length === 0) {
      await api.call("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Не нашёл такого пользователя на сайте"
      });
      return;
    }

    const where = describeTarget(target, senderUsername);
    await api.call("answerCallbackQuery", { callback_query_id: callbackId, text: `Добавил ${where}` });

    const film = await deps.getFilm(kinopoiskId).catch(() => null);
    const title = film ? `«${escapeHtml(film.title)}»` : "Фильм";
    await send(chatId, `✅ ${title} — добавил ${where}`);
    await notifyOthers(added, senderUsername, film, kinopoiskId, isShared);
  }

  async function handleAlternatives(chatId: number, callbackId: string) {
    const films = lastResults.get(chatId) ?? [];
    await api.call("answerCallbackQuery", { callback_query_id: callbackId });

    if (films.length < 2) {
      await send(chatId, "Других вариантов нет. Пришли название ещё раз, можно с годом.");
      return;
    }

    await send(chatId, "Другие варианты:", {
      inline_keyboard: films.slice(1).map((film) => [
        {
          text: film.year ? `${film.title} (${film.year})` : film.title,
          callback_data: `show:${film.kinopoiskId}`
        }
      ])
    });
  }

  async function handleUpdate(update: TelegramUpdate) {
    const message = update.message;
    if (message?.text && message.from) {
      const username = telegramUsers.get(message.from.id);
      if (!username) {
        await send(
          message.chat.id,
          `Это личный бот. Твой Telegram ID: <code>${message.from.id}</code> — передай его владельцу, чтобы он тебя добавил.`
        );
        return;
      }

      await handleText(message.chat.id, username, message.text.trim());
      return;
    }

    const callback = update.callback_query;
    if (!callback) {
      return;
    }

    const username = telegramUsers.get(callback.from.id);
    const chatId = callback.message?.chat.id;
    const action = parseCallbackData(callback.data);
    if (!username || chatId === undefined || !action) {
      await api.call("answerCallbackQuery", { callback_query_id: callback.id, text: "Нет доступа" });
      return;
    }

    if (action.kind === "add") {
      await handleAdd(chatId, callback.id, username, action.kinopoiskId, action.target);
    } else if (action.kind === "alts") {
      await handleAlternatives(chatId, callback.id);
    } else {
      await api.call("answerCallbackQuery", { callback_query_id: callback.id });
      await sendFilmCard(chatId, action.kinopoiskId, username);
    }
  }

  return { handleUpdate };
}

export function createTelegramApi(token: string, fetchImpl: typeof fetch = fetch): TelegramApi {
  return {
    async call<T>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
      const timeoutMs = typeof payload.timeout === "number" ? (payload.timeout + 10) * 1000 : 30_000;
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; result?: T; description?: string }
        | null;

      if (!body?.ok) {
        throw new Error(`Telegram ${method}: ${body?.description ?? response.status}`);
      }
      return body.result as T;
    }
  };
}

const POLL_TIMEOUT_SECONDS = 50;
const POLL_RETRY_MS = 5_000;

export function startTelegramBot(token: string, deps: Omit<TelegramBotDeps, "api">): () => void {
  const api = createTelegramApi(token);
  const bot = createTelegramBot({ ...deps, api });
  let stopped = false;

  void (async () => {
    await api.call("deleteWebhook").catch(() => undefined);
    let offset = 0;

    while (!stopped) {
      try {
        const updates = await api.call<TelegramUpdate[]>("getUpdates", {
          offset,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: ["message", "callback_query"]
        });

        for (const update of updates) {
          offset = update.update_id + 1;
          await bot.handleUpdate(update).catch((error: unknown) => {
            console.error("telegram bot: update failed", error instanceof Error ? error.message : error);
          });
        }
      } catch (error) {
        console.error("telegram bot: polling failed", error instanceof Error ? error.message : error);
        await new Promise((resolve) => setTimeout(resolve, POLL_RETRY_MS));
      }
    }
  })();

  console.log(`telegram bot started for ${deps.telegramUsers.size} user(s)`);
  return () => {
    stopped = true;
  };
}
