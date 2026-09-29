import { useState, type FormEvent } from "react";

import { siteApi } from "../lib/siteApi";

const MIN_PASSWORD_LENGTH = 8;

type SignupFormProps = {
  onBackToLogin: () => void;
};

export function SignupForm({ onBackToLogin }: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await siteApi.signup(email, password);
      setIsSent(true);
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : "Не удалось отправить заявку");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSent) {
    return (
      <div className="auth-gate__form">
        <p className="auth-gate__status" role="status">
          Заявка отправлена. Владелец рассмотрит её — попробуйте войти позже.
        </p>
        <button type="button" className="auth-gate__submit" onClick={onBackToLogin}>
          Ко входу
        </button>
      </div>
    );
  }

  return (
    <form className="auth-gate__form" onSubmit={handleSubmit}>
      <label className="auth-gate__field">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={isSubmitting}
          required
        />
      </label>

      <label className="auth-gate__field">
        <span>Пароль</span>
        <input
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`Не короче ${MIN_PASSWORD_LENGTH} символов`}
          minLength={MIN_PASSWORD_LENGTH}
          disabled={isSubmitting}
          required
        />
      </label>

      <label className="auth-gate__field">
        <span>Повторите пароль</span>
        <input
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
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
        {isSubmitting ? "Отправляем..." : "Отправить заявку"}
      </button>
    </form>
  );
}
