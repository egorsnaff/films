import { BrandMark } from "./BrandMark";

export function AuthGateBoot() {
  return (
    <div className="auth-gate-boot" aria-busy="true" aria-live="polite" aria-label="Загрузка">
      <div className="auth-gate-boot__ambient auth-gate-boot__ambient--left" aria-hidden="true" />
      <div className="auth-gate-boot__ambient auth-gate-boot__ambient--right" aria-hidden="true" />
      <div className="auth-gate-boot__shell">
        <BrandMark />
      </div>
    </div>
  );
}
