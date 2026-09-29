import { useState, type FormEvent } from "react";

import { BrandMark } from "./BrandMark";
import { SignupForm } from "./SignupForm";

type AuthGateScreenProps = {
  username: string;
  password: string;
  error: string | null;
  isSubmitting: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AuthGateScreen({
  username,
  password,
  error,
  isSubmitting,
  onUsernameChange,
  onPasswordChange,
  onSubmit
}: AuthGateScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const isSignup = mode === "signup";

  return (
    <div className="auth-gate">
      <div className="auth-gate__ambient auth-gate__ambient--left" aria-hidden="true" />
      <div className="auth-gate__ambient auth-gate__ambient--right" aria-hidden="true" />
      <div className="auth-gate__grain" aria-hidden="true" />

      <main className="auth-gate__shell">
        <header className="auth-gate__brand">
          <BrandMark />
        </header>

        <section className="auth-gate__panel" aria-labelledby="auth-gate-title">
          <p className="auth-gate__eyebrow">Закрытый доступ</p>
          <h1 id="auth-gate-title" className="auth-gate__title">
            {isSignup ? "Заявка на доступ" : "Войдите, чтобы открыть сеанс"}
          </h1>
          <p className="auth-gate__lead">
            {isSignup
              ? "Оставьте email и пароль. Когда владелец одобрит заявку, войдите с ними на этой странице."
              : "Каталог и просмотр доступны только участникам. Войдите по логину или email либо подайте заявку на доступ."}
          </p>

          {isSignup ? (
            <SignupForm onBackToLogin={() => setMode("login")} />
          ) : (
            <form className="auth-gate__form" onSubmit={onSubmit}>
              <label className="auth-gate__field">
                <span>Логин или email</span>
                <input
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => onUsernameChange(event.target.value)}
                  placeholder="Логин или email"
                  disabled={isSubmitting}
                  required
                />
              </label>

              <label className="auth-gate__field">
                <span>Пароль</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  required
                />
              </label>

              {error ? (
                <p className="auth-gate__error" role="alert">
                  {error}
                </p>
              ) : null}

              <button type="submit" className="auth-gate__submit" disabled={isSubmitting}>
                {isSubmitting ? "Входим..." : "Войти"}
              </button>
            </form>
          )}
        </section>

        <p className="auth-gate__footnote">
          {isSignup ? "Уже есть доступ? " : "Нет доступа? "}
          <button
            type="button"
            className="auth-gate__switch"
            onClick={() => setMode(isSignup ? "login" : "signup")}
          >
            {isSignup ? "Войти" : "Подать заявку"}
          </button>
        </p>
      </main>
    </div>
  );
}
