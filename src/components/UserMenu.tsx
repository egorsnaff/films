import { useEffect, useRef, useState } from "react";

type UserMenuProps = {
  isAuthenticated: boolean;
  onLogin: () => void;
  onProfile: () => void;
  onLogout: () => void;
};

export function UserMenu({ isAuthenticated, onLogin, onProfile, onLogout }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, []);

  if (!isAuthenticated) {
    return (
      <button type="button" className="topbar-auth-button topbar-auth-button--primary" onClick={onLogin}>
        Войти
      </button>
    );
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu__trigger"
        aria-label="Меню пользователя"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="user-menu__avatar" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="user-menu__dropdown" role="menu">
          <button type="button" role="menuitem" onClick={() => { setIsOpen(false); onProfile(); }}>
            Кабинет
          </button>
          <button
            type="button"
            role="menuitem"
            className="user-menu__logout"
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
          >
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
