import express, { type RequestHandler } from "express";

import {
  MIN_PASSWORD_LENGTH,
  createSignupRequest,
  decideSignupRequest,
  listSignupRequests,
  type DecisionErrorCode,
  type SignupDecision,
  type SignupErrorCode,
  type SignupRequest
} from "./signup.js";

const SIGNUP_ERRORS: Record<SignupErrorCode, { status: number; message: string }> = {
  invalid_email: { status: 400, message: "Введите корректный email" },
  weak_password: {
    status: 400,
    message: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`
  },
  already_registered: { status: 409, message: "Этот email уже зарегистрирован — просто войдите" },
  pending: { status: 409, message: "Заявка с этим email уже на рассмотрении" },
  rejected: { status: 409, message: "Заявка с этим email отклонена" },
  too_many_pending: { status: 429, message: "Сейчас слишком много заявок, попробуйте позже" }
};

const DECISION_ERRORS: Record<DecisionErrorCode, { status: number; message: string }> = {
  not_found: { status: 404, message: "Заявка не найдена" },
  already_decided: { status: 409, message: "Заявка уже обработана" }
};

export const requireAdmin: RequestHandler = (_req, res, next) => {
  const user = res.locals.user as { is_admin?: number } | undefined;
  if (user?.is_admin !== 1) {
    res.status(403).json({ error: "Нет доступа" });
    return;
  }
  next();
};

export type SignupRouterDeps = {
  requireUser: RequestHandler;
  onSignupRequest(request: SignupRequest): void;
};

export function createSignupRouter({ requireUser, onSignupRequest }: SignupRouterDeps): express.Router {
  const router = express.Router();

  router.post("/auth/signup", (req, res) => {
    const result = createSignupRequest(
      String(req.body?.email ?? ""),
      String(req.body?.password ?? "")
    );

    if (!result.ok) {
      const { status, message } = SIGNUP_ERRORS[result.error];
      res.status(status).json({ error: message });
      return;
    }

    onSignupRequest(result.request);
    res.status(201).json({ ok: true });
  });

  router.get("/admin/signup-requests", requireUser, requireAdmin, (req, res) => {
    const filter = req.query.status === "decided" ? "decided" : "pending";
    res.json({ requests: listSignupRequests(filter) });
  });

  const decide =
    (decision: SignupDecision): RequestHandler =>
    (req, res) => {
      const id = Number(req.params.id);
      const admin = res.locals.user as { id: number };
      const result =
        Number.isSafeInteger(id) && id > 0
          ? decideSignupRequest(id, decision, admin.id)
          : ({ ok: false, error: "not_found" } as const);

      if (!result.ok) {
        const { status, message } = DECISION_ERRORS[result.error];
        res.status(status).json({ error: message });
        return;
      }

      res.json({ request: result.request });
    };

  router.post("/admin/signup-requests/:id/approve", requireUser, requireAdmin, decide("approve"));
  router.post("/admin/signup-requests/:id/reject", requireUser, requireAdmin, decide("reject"));

  return router;
}
