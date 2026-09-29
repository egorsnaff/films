import { describe, expect, it, vi } from "vitest";

import type { SharedListMember } from "./sharedList.js";
import {
  buildFilmKeyboard,
  createTelegramBot,
  formatFilmCaption,
  parseCallbackData,
  parseTelegramGroup,
  parseTelegramUsers,
  pluralize,
  type BotFilm,
  type TelegramBotDeps
} from "./telegramBot.js";

const members: SharedListMember[] = [
  { username: "egor", dative: "Егору" },
  { username: "kseniya", dative: "Ксении" }
];

const darkKnight: BotFilm = {
  kinopoiskId: 111543,
  title: "Темный рыцарь",
  originalTitle: "The Dark Knight",
  year: "2008",
  posterUrl: "https://example.test/poster.jpg",
  rating: "8.5",
  imdbRating: "9.0",
  description: "Бэтмен поднимает ставки в войне с криминалом <и> Джокером.",
  filmLengthMinutes: 152,
  genres: ["боевик", "криминал"]
};

const EGOR_TG = 1001;
const KSENIYA_TG = 1002;

function createHarness(overrides: Partial<TelegramBotDeps> = {}) {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const api = {
    call: vi.fn(async (method: string, payload: Record<string, unknown> = {}) => {
      calls.push({ method, payload });
      return {};
    })
  } as unknown as TelegramBotDeps["api"];
  const addToPlan = vi.fn(() => true);
  const decideSignup = vi.fn<TelegramBotDeps["decideSignup"]>(() => ({
    ok: true,
    request: { id: 7, email: "new@example.com", status: "approved", createdAt: "", decidedAt: "" }
  }));

  const bot = createTelegramBot({
    api,
    members,
    telegramUsers: new Map([
      [EGOR_TG, "egor"],
      [KSENIYA_TG, "kseniya"]
    ]),
    siteUrl: "https://films.qzz.io/",
    searchFilms: async () => [darkKnight, { kinopoiskId: 42, title: "Темный рыцарь: Возрождение", year: "2012" }],
    getFilm: async () => darkKnight,
    getAwards: async () => [{ name: "Оскар", wins: 2, nominations: 8 }],
    addToPlan,
    isAdmin: (username: string) => username === "egor",
    decideSignup,
    ...overrides
  });

  return { bot, calls, addToPlan, decideSignup };
}

function textUpdate(fromId: number, text: string) {
  return { update_id: 1, message: { message_id: 1, chat: { id: fromId }, from: { id: fromId }, text } };
}

function callbackUpdate(fromId: number, data: string) {
  return {
    update_id: 2,
    callback_query: { id: "cb", from: { id: fromId }, data, message: { message_id: 5, chat: { id: fromId } } }
  };
}

const GROUP_ID = -1004333415561;

function groupTextUpdate(fromId: number, threadId: number, text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      message_thread_id: threadId,
      chat: { id: GROUP_ID, type: "supergroup" },
      from: { id: fromId },
      text
    }
  };
}

function groupCallbackUpdate(fromId: number, threadId: number, data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: "cb",
      from: { id: fromId },
      data,
      message: { message_id: 5, message_thread_id: threadId, chat: { id: GROUP_ID, type: "supergroup" } }
    }
  };
}

describe("parseTelegramUsers", () => {
  it("maps telegram ids to site usernames and skips junk", () => {
    const users = parseTelegramUsers(" egor:1001, kseniya:1002 ,bad, leha:abc");
    expect([...users]).toEqual([
      [1001, "egor"],
      [1002, "kseniya"]
    ]);
    expect(parseTelegramUsers(undefined).size).toBe(0);
  });
});

describe("formatFilmCaption", () => {
  it("includes title, genres, ratings, awards, escaped description and site link", () => {
    const caption = formatFilmCaption(darkKnight, [{ name: "Оскар", wins: 2, nominations: 8 }], "https://films.qzz.io");

    expect(caption).toContain("<b>Темный рыцарь (2008)</b>");
    expect(caption).toContain("<i>The Dark Knight</i>");
    expect(caption).toContain("боевик, криминал · 152 мин");
    expect(caption).toContain("КП 8.5 · IMDb 9.0");
    expect(caption).toContain("🏆 Оскар — 2 победы");
    expect(caption).toContain("&lt;и&gt;");
    expect(caption).toContain('href="https://films.qzz.io/watch/111543"');
  });

  it("truncates long descriptions to fit the caption limit", () => {
    const caption = formatFilmCaption(
      { ...darkKnight, description: "очень длинно & ".repeat(200) },
      [],
      "https://films.qzz.io"
    );

    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain("…");
    expect(caption).toContain("/watch/111543");
  });
});

describe("pluralize", () => {
  it("picks russian plural forms", () => {
    const forms: [string, string, string] = ["победа", "победы", "побед"];
    expect([1, 2, 5, 11, 21, 22, 112].map((count) => pluralize(count, forms))).toEqual([
      "победа",
      "победы",
      "побед",
      "побед",
      "победа",
      "победы",
      "побед"
    ]);
  });
});

describe("buildFilmKeyboard", () => {
  it("offers each member by name, the shared list and alternatives", () => {
    const keyboard = buildFilmKeyboard(111543, members, true);
    expect(keyboard.inline_keyboard.map((row) => row.map((button) => button.text))).toEqual([
      ["➕ Егору", "➕ Ксении"],
      ["➕ В общий список"],
      ["Не тот? Другие варианты"]
    ]);
    expect(keyboard.inline_keyboard[0][1].callback_data).toBe("add:111543:kseniya");
  });
});

describe("parseTelegramGroup", () => {
  it("reads a supergroup id with optional thread and default user", () => {
    expect(parseTelegramGroup({ chatId: "-1004333415561", defaultUsername: "kseniya" })).toEqual({
      chatId: -1004333415561,
      threadId: undefined,
      defaultUsername: "kseniya"
    });
    expect(parseTelegramGroup({ chatId: "-1004333415561", threadId: "12" })?.threadId).toBe(12);
    expect(parseTelegramGroup({ chatId: "" })).toBeUndefined();
    expect(parseTelegramGroup({ chatId: "175167597" })).toBeUndefined();
  });
});

describe("parseCallbackData", () => {
  it("parses known actions and rejects the rest", () => {
    expect(parseCallbackData("add:111543:shared")).toEqual({ kind: "add", kinopoiskId: 111543, target: "shared" });
    expect(parseCallbackData("show:42")).toEqual({ kind: "show", kinopoiskId: 42 });
    expect(parseCallbackData("alts")).toEqual({ kind: "alts" });
    expect(parseCallbackData("add:abc:egor")).toBeNull();
    expect(parseCallbackData("drop:1")).toBeNull();
    expect(parseCallbackData(undefined)).toBeNull();
  });
});

describe("telegram bot flow", () => {
  it("answers strangers with their telegram id and does not search", async () => {
    const searchFilms = vi.fn(async () => []);
    const { bot, calls } = createHarness({ searchFilms });

    await bot.handleUpdate(textUpdate(777, "Матрица"));

    expect(searchFilms).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(String(calls[0].payload.text)).toContain("<code>777</code>");
  });

  it("sends the best match as a poster card with list buttons", async () => {
    const { bot, calls } = createHarness();

    await bot.handleUpdate(textUpdate(EGOR_TG, "темный рыцарь"));

    const photo = calls.find((call) => call.method === "sendPhoto");
    expect(photo?.payload.photo).toBe(darkKnight.posterUrl);
    expect(String(photo?.payload.caption)).toContain("Темный рыцарь");
    const keyboard = photo?.payload.reply_markup as ReturnType<typeof buildFilmKeyboard>;
    expect(keyboard.inline_keyboard.flat().map((button) => button.text)).toContain("Не тот? Другие варианты");
  });

  it("falls back to a text card when telegram cannot fetch the poster", async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const { bot } = createHarness({
      api: {
        call: vi.fn(async (method: string, payload: Record<string, unknown> = {}) => {
          calls.push({ method, payload });
          if (method === "sendPhoto") {
            throw new Error("Bad Request: wrong file identifier");
          }
          return {};
        })
      } as unknown as TelegramBotDeps["api"]
    });

    await bot.handleUpdate(textUpdate(EGOR_TG, "темный рыцарь"));

    const text = calls.filter((call) => call.method === "sendMessage").at(-1);
    expect(String(text?.payload.text)).toContain("/watch/111543");
    expect(text?.payload.reply_markup).toBeDefined();
  });

  it("adds to the other member's plan and notifies them", async () => {
    const { bot, calls, addToPlan } = createHarness();

    await bot.handleUpdate(callbackUpdate(EGOR_TG, "add:111543:kseniya"));

    expect(addToPlan).toHaveBeenCalledWith("kseniya", 111543);
    expect(calls.find((call) => call.method === "answerCallbackQuery")?.payload.text).toBe(
      "Добавил Ксении в «Буду смотреть»"
    );
    const notice = calls.find((call) => call.method === "sendMessage" && call.payload.chat_id === KSENIYA_TG);
    expect(String(notice?.payload.text)).toContain("egor добавил тебе");
  });

  it("adds to both plans for the shared list", async () => {
    const { bot, addToPlan } = createHarness();

    await bot.handleUpdate(callbackUpdate(KSENIYA_TG, "add:111543:shared"));

    expect(addToPlan.mock.calls).toEqual([
      ["egor", 111543],
      ["kseniya", 111543]
    ]);
  });

  it("replies inside the group topic and treats other members as the default user", async () => {
    const { bot, calls, addToPlan } = createHarness({
      telegramUsers: new Map([[EGOR_TG, "egor"]]),
      group: { chatId: GROUP_ID, defaultUsername: "kseniya" }
    });

    await bot.handleUpdate(groupTextUpdate(555, 7, "темный рыцарь"));
    const photo = calls.find((call) => call.method === "sendPhoto");
    expect(photo?.payload).toMatchObject({ chat_id: GROUP_ID, message_thread_id: 7 });

    calls.length = 0;
    await bot.handleUpdate(groupCallbackUpdate(555, 7, "add:111543:kseniya"));
    expect(addToPlan).toHaveBeenCalledWith("kseniya", 111543);
    const confirmation = calls.find((call) => call.method === "sendMessage");
    expect(confirmation?.payload).toMatchObject({ chat_id: GROUP_ID, message_thread_id: 7 });
    expect(calls.filter((call) => call.method === "sendMessage")).toHaveLength(1);
  });

  it("ignores other groups and other topics when a thread is configured", async () => {
    const { bot, calls } = createHarness({ group: { chatId: GROUP_ID, threadId: 7, defaultUsername: "kseniya" } });

    await bot.handleUpdate(groupTextUpdate(555, 8, "темный рыцарь"));
    await bot.handleUpdate({
      update_id: 3,
      message: { message_id: 1, chat: { id: -100999, type: "supergroup" }, from: { id: EGOR_TG }, text: "Матрица" }
    });

    expect(calls).toHaveLength(0);
  });

  it("rejects adding to someone outside the shared list", async () => {
    const { bot, calls, addToPlan } = createHarness();

    await bot.handleUpdate(callbackUpdate(EGOR_TG, "add:111543:leha"));

    expect(addToPlan).not.toHaveBeenCalled();
    expect(calls[0].payload.text).toBe("Так нельзя");
  });

  it("lists the remaining search results as alternatives", async () => {
    const { bot, calls } = createHarness();
    await bot.handleUpdate(textUpdate(EGOR_TG, "темный рыцарь"));
    calls.length = 0;

    await bot.handleUpdate(callbackUpdate(EGOR_TG, "alts"));

    const message = calls.find((call) => call.method === "sendMessage");
    const keyboard = message?.payload.reply_markup as ReturnType<typeof buildFilmKeyboard>;
    expect(keyboard.inline_keyboard).toEqual([
      [{ text: "Темный рыцарь: Возрождение (2012)", callback_data: "show:42" }]
    ]);
  });
});

describe("signup requests", () => {
  const request = {
    id: 7,
    email: "new@example.com",
    status: "pending" as const,
    createdAt: "2026-09-29T10:00:00.000Z",
    decidedAt: null
  };

  it("parses signup callbacks", () => {
    expect(parseCallbackData("signup:approve:7")).toEqual({ kind: "signup", decision: "approve", requestId: 7 });
    expect(parseCallbackData("signup:reject:7")).toEqual({ kind: "signup", decision: "reject", requestId: 7 });
    expect(parseCallbackData("signup:ban:7")).toBeNull();
    expect(parseCallbackData("signup:approve:0")).toBeNull();
  });

  it("notifies only admins, in private chats", async () => {
    const { bot, calls } = createHarness();

    await bot.notifySignupRequest(request);

    const sent = calls.filter((call) => call.method === "sendMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({
      chat_id: EGOR_TG,
      text: expect.stringContaining("new@example.com"),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Одобрить", callback_data: "signup:approve:7" },
            { text: "❌ Отклонить", callback_data: "signup:reject:7" }
          ]
        ]
      }
    });
  });

  it("refuses decisions from non-admins", async () => {
    const { bot, calls, decideSignup } = createHarness();

    await bot.handleUpdate(callbackUpdate(KSENIYA_TG, "signup:approve:7"));

    expect(decideSignup).not.toHaveBeenCalled();
    expect(calls).toContainEqual({
      method: "answerCallbackQuery",
      payload: { callback_query_id: "cb", text: "Нет доступа" }
    });
  });

  it("applies the decision and replaces the buttons with the verdict", async () => {
    const { bot, calls, decideSignup } = createHarness();

    await bot.handleUpdate(callbackUpdate(EGOR_TG, "signup:approve:7"));

    expect(decideSignup).toHaveBeenCalledWith(7, "approve", "egor");
    expect(calls.find((call) => call.method === "editMessageText")?.payload).toMatchObject({
      chat_id: EGOR_TG,
      message_id: 5,
      text: expect.stringContaining("✅ Одобрено"),
      reply_markup: { inline_keyboard: [] }
    });
  });

  it("tells the admin when the request was already handled", async () => {
    const { bot, calls } = createHarness({
      decideSignup: () => ({ ok: false, error: "already_decided" })
    });

    await bot.handleUpdate(callbackUpdate(EGOR_TG, "signup:reject:7"));

    expect(calls).toContainEqual({
      method: "answerCallbackQuery",
      payload: { callback_query_id: "cb", text: "Уже обработано" }
    });
    expect(calls.some((call) => call.method === "editMessageReplyMarkup")).toBe(true);
  });
});
