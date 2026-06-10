type BrandMarkProps = {
  onClick: () => void;
};

export function BrandMark({ onClick }: BrandMarkProps) {
  return (
    <button className="brand-mark" type="button" onClick={onClick} aria-label="Сеанс — на главную">
      <span className="brand-mark__glyph" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M5 24c4.2-9.8 8.4-13.8 11-13.8s6.8 4 11 13.8"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="16" cy="10.8" r="2" fill="currentColor" />
        </svg>
      </span>
      <span className="brand-mark__copy">
        <strong>Сеанс</strong>
        <small>кино для вечера</small>
      </span>
    </button>
  );
}
