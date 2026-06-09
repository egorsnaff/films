import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";

import {
  deleteUserFilm,
  findUserById,
  findUserByUsername,
  listUserFilms,
  updateUserFilmProgress,
  upsertUserFilm,
  type WatchStatus
} from "./db.js";
import {
  ensureFilmsCached,
  getFilmDetails,
  getRecentCatalog,
  getSimilarFilms,
  getThemeList,
  getTopList,
  probeKinopoisk,
  searchCatalog
} from "./kinopoiskProxy.js";
import { getRecommendations } from "./recommendations.js";

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT ?? 3001);
const jwtSecret = process.env.JWT_SECRET ?? "change-me-in-production";
const cookieName = "films_session";
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173,https://films.qzz.io")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

type SessionPayload = {
  sub: number;
  username: string;
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("CORS blocked"));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

function createToken(user: { id: number; username: string }): string {
  return jwt.sign({ sub: user.id, username: user.username } satisfies SessionPayload, jwtSecret, {
    expiresIn: "30d"
  });
}

function readSession(req: express.Request): SessionPayload | null {
  const token = req.cookies[cookieName];

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, jwtSecret) as unknown as SessionPayload;
  } catch {
    return null;
  }
}

function requireUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = readSession(req);

  if (!session) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  const user = findUserById(session.sub);

  if (!user) {
    res.status(401).json({ error: "Пользователь не найден" });
    return;
  }

  res.locals.user = user;
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/kp", async (_req, res) => {
  const result = await probeKinopoisk();

  if (!result.ok) {
    const status = result.keyConfigured ? 502 : 503;
    res.status(status).json(result);
    return;
  }

  res.json(result);
});

function handleKpError(error: unknown, res: express.Response) {
  const message = error instanceof Error ? error.message : "Kinopoisk proxy error";
  const status = message.includes("не настроен") ? 503 : 502;
  res.status(status).json({ error: message });
}

app.get("/kp/films/:kinopoiskId", async (req, res) => {
  const kinopoiskId = Number(req.params.kinopoiskId);
  if (!Number.isFinite(kinopoiskId)) {
    res.status(400).json({ error: "Некорректный id фильма" });
    return;
  }

  try {
    const result = await getFilmDetails(kinopoiskId);
    res.json(result);
  } catch (error) {
    handleKpError(error, res);
  }
});

app.get("/kp/films/:kinopoiskId/similars", async (req, res) => {
  const kinopoiskId = Number(req.params.kinopoiskId);
  if (!Number.isFinite(kinopoiskId)) {
    res.status(400).json({ error: "Некорректный id фильма" });
    return;
  }

  try {
    const result = await getSimilarFilms(kinopoiskId);
    res.json(result);
  } catch (error) {
    handleKpError(error, res);
  }
});

app.get("/kp/catalog/recent", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const type = req.query.type === "TV_SERIES" ? "TV_SERIES" : "FILM";

  try {
    const result = await getRecentCatalog(page, type);
    res.json(result);
  } catch (error) {
    handleKpError(error, res);
  }
});

app.get("/kp/search", async (req, res) => {
  const keyword = String(req.query.keyword ?? "");
  const page = Math.max(1, Number(req.query.page ?? 1));

  try {
    const result = await searchCatalog(keyword, page);
    res.json(result);
  } catch (error) {
    handleKpError(error, res);
  }
});

app.get("/kp/top", async (req, res) => {
  const type = String(req.query.type ?? "");
  const page = Math.max(1, Number(req.query.page ?? 1));

  try {
    const result = await getTopList(type, page);
    res.json(result);
  } catch (error) {
    handleKpError(error, res);
  }
});

app.get("/kp/collections", async (req, res) => {
  const type = String(req.query.type ?? "");
  const page = Math.max(1, Number(req.query.page ?? 1));

  try {
    const result = await getThemeList(type, page);
    res.json(result);
  } catch (error) {
    handleKpError(error, res);
  }
});

app.get("/auth/me", (req, res) => {
  const session = readSession(req);

  if (!session) {
    res.status(401).json({ error: "Не авторизован" });
    return;
  }

  const user = findUserById(session.sub);

  if (!user) {
    res.status(401).json({ error: "Пользователь не найден" });
    return;
  }

  res.json({ user: { id: user.id, username: user.username } });
});

app.post("/auth/login", (req, res) => {
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (!username || !password) {
    res.status(400).json({ error: "Введите логин и пароль" });
    return;
  }

  const user = findUserByUsername(username);

  if (!user) {
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);

  if (!isValid) {
    res.status(401).json({ error: "Неверный логин или пароль" });
    return;
  }

  const token = createToken(user);
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  res.json({ user: { id: user.id, username: user.username } });
});

app.post("/auth/logout", (_req, res) => {
  res.clearCookie(cookieName);
  res.status(204).send();
});

app.get("/recommendations", requireUser, async (req, res) => {
  const user = res.locals.user as { id: number };

  try {
    const result = await getRecommendations(user.id);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось собрать рекомендации";
    res.status(502).json({ error: message });
  }
});

app.get("/lists", requireUser, async (req, res) => {
  const user = res.locals.user as { id: number };
  const items = listUserFilms(user.id).map((item) => ({
    kinopoiskId: item.kinopoisk_id,
    status: item.status,
    watchSeconds: item.watch_seconds,
    progressPercent: item.progress_percent,
    updatedAt: item.updated_at
  }));

  try {
    const kinopoiskIds = items.map((item) => item.kinopoiskId);
    const films = await ensureFilmsCached(kinopoiskIds, 8);
    res.json({ items, films });
  } catch (error) {
    res.json({ items, films: {} });
  }
});

app.put("/lists", requireUser, (req, res) => {
  const user = res.locals.user as { id: number };
  const kinopoiskId = Number(req.body?.kinopoiskId);
  const status = String(req.body?.status ?? "") as WatchStatus;
  const allowed: WatchStatus[] = ["watching", "plan", "waiting", "watched"];

  if (!Number.isFinite(kinopoiskId) || !allowed.includes(status)) {
    res.status(400).json({ error: "Некорректные данные списка" });
    return;
  }

  const item = upsertUserFilm(user.id, kinopoiskId, status);

  res.json({
    item: {
      kinopoiskId: item.kinopoisk_id,
      status: item.status,
      watchSeconds: item.watch_seconds,
      progressPercent: item.progress_percent,
      updatedAt: item.updated_at
    }
  });
});

app.patch("/lists/progress", requireUser, (req, res) => {
  const user = res.locals.user as { id: number };
  const kinopoiskId = Number(req.body?.kinopoiskId);
  const watchSeconds = Number(req.body?.watchSeconds ?? 0);
  const progressPercent = Number(req.body?.progressPercent ?? 0);
  const forceStatus = req.body?.forceStatus as WatchStatus | undefined;
  const allowed: WatchStatus[] = ["watching", "plan", "waiting", "watched"];

  if (
    !Number.isFinite(kinopoiskId) ||
    !Number.isFinite(watchSeconds) ||
    !Number.isFinite(progressPercent) ||
    (forceStatus && !allowed.includes(forceStatus))
  ) {
    res.status(400).json({ error: "Некорректные данные прогресса" });
    return;
  }

  const item = updateUserFilmProgress(
    user.id,
    kinopoiskId,
    Math.max(0, Math.floor(watchSeconds)),
    Math.min(100, Math.max(0, progressPercent)),
    forceStatus
  );

  res.json({
    item: {
      kinopoiskId: item.kinopoisk_id,
      status: item.status,
      watchSeconds: item.watch_seconds,
      progressPercent: item.progress_percent,
      updatedAt: item.updated_at
    }
  });
});

app.delete("/lists/:kinopoiskId", requireUser, (req, res) => {
  const user = res.locals.user as { id: number };
  const kinopoiskId = Number(req.params.kinopoiskId);

  if (!Number.isFinite(kinopoiskId)) {
    res.status(400).json({ error: "Некорректный id фильма" });
    return;
  }

  deleteUserFilm(user.id, kinopoiskId);
  res.status(204).send();
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error(error);
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json({ error: message });
});

app.listen(port, () => {
  console.log(`films api listening on ${port}`);
});
