type BackButtonProps = {
  label: string;
  onClick: () => void;
};

export function BackButton({ label, onClick }: BackButtonProps) {
  return (
    <button type="button" className="back-button back-button--fancy" onClick={onClick}>
      <span className="back-button__icon" aria-hidden="true">
        ←
      </span>
      <span>{label}</span>
    </button>
  );
}
