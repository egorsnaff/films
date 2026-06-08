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
  upsertUserFilm,
  type WatchStatus
} from "./db.js";

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

app.get("/lists", requireUser, (req, res) => {
  const user = res.locals.user as { id: number };
  const items = listUserFilms(user.id).map((item) => ({
    kinopoiskId: item.kinopoisk_id,
    status: item.status,
    updatedAt: item.updated_at
  }));

  res.json({ items });
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

app.listen(port, () => {
  console.log(`films api listening on ${port}`);
});
