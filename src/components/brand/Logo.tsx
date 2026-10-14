type Props = { withText?: boolean; className?: string; subtitle?: string };

/** Marque BCX : un thêta (Θ) construit dans un cadre de code. */
export function LogoMark({ className = "logo-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
      <ellipse cx="16" cy="16" rx="7" ry="9" stroke="currentColor" strokeWidth="2.2" />
      <path d="M10.5 16h11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="25" cy="7" r="1.8" fill="var(--gold)" />
    </svg>
  );
}

export function Logo({ withText = true, className = "", subtitle = "System · BCX" }: Props) {
  return (
    <span className={`logo ${className}`} aria-label="BICKRI CODEX SYSTEM">
      <LogoMark />
      {withText && (
        <span className="logo-word">
          <b>BICKRI CODEX</b>
          <small>{subtitle}</small>
        </span>
      )}
    </span>
  );
}
