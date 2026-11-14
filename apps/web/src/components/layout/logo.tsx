export function OtopioLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-label="Otopio">
      <circle cx="14" cy="20" r="8.5" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="20" cy="20" r="8.5" stroke="currentColor" strokeWidth="2.6" opacity=".75" />
      <circle cx="26" cy="20" r="8.5" stroke="currentColor" strokeWidth="2.6" opacity=".5" />
    </svg>
  );
}

export function OtopioWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-semibold tracking-[-.04em]">otopio</span>
    </span>
  );
}
