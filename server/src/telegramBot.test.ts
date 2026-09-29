import { describe, expect, it, vi } from "vitest";

import type { SharedListMember } from "./sharedList.js";
import {
  buildFilmKeyboard,
  createTelegramBot,
  formatFilmCaption,
  parseCallbackData,
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
    ...overrides
  });

  return { bot, calls, addToPlan };
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
  it("offers me, the other member, the shared list and alternatives", () => {
    const keyboard = buildFilmKeyboard(111543, "kseniya", members, true);
    expect(keyboard.inline_keyboard.map((row) => row.map((button) => button.text))).toEqual([
      ["➕ Мне", "➕ Егору"],
      ["➕ В общий список"],
      ["Не тот? Другие варианты"]
    ]);
    expect(keyboard.inline_keyboard[0][0].callback_data).toBe("add:111543:kseniya");
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
