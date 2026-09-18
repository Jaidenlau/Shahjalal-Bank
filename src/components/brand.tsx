import type { ReactNode } from "react";

/**
 * The Shahjalal Islami Bank mark, drawn inline as SVG.
 *
 * Deliberately not an image file: there is no network at the venue, and an
 * asset that fails to load on the login screen is the worst possible first
 * impression. The geometry is an interlocking form in the bank's green,
 * evoking their existing mark without reproducing a logo we were not given.
 */
export function BankMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
      <path
        d="M24 6.5c-6.2 4.4-9.8 9.9-9.8 15.6 0 6.2 4.3 11.3 9.8 15.4 5.5-4.1 9.8-9.2 9.8-15.4 0-5.7-3.6-11.2-9.8-15.6z"
        fill="currentColor" opacity="0.14"
      />
      <path
        d="M24 9.5v29M24 9.5c-5 3.9-7.9 8.4-7.9 13.1 0 5.3 3.5 9.7 7.9 13.2M24 9.5c5 3.9 7.9 8.4 7.9 13.1 0 5.3-3.5 9.7-7.9 13.2"
        fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"
      />
      <circle cx="24" cy="22.6" r="3.1" fill="currentColor" />
    </svg>
  );
}

/** The product mark. Vertex is named in the submitted product datasheet. */
export function VertexMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 3.5L28.5 26H3.5L16 3.5z" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" />
      <path d="M16 12.5L21.5 22h-11L16 12.5z" fill="currentColor" />
    </svg>
  );
}

export function BrandLockup({
  size = "md", className = "",
}: { size?: "sm" | "md" | "lg"; className?: string }) {
  const s = {
    sm: { mark: "h-7 w-7", name: "text-[15px]", sub: "text-[10.5px]" },
    md: { mark: "h-9 w-9", name: "text-[18px]", sub: "text-[11.5px]" },
    lg: { mark: "h-12 w-12", name: "text-[26px]", sub: "text-[13px]" },
  }[size];
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <VertexMark className={`${s.mark} text-brand-400`} />
      <div className="leading-tight">
        <div className={`${s.name} font-bold tracking-[-0.01em]`}>
          Vertex<span className="font-light"> ERP</span>
        </div>
        <div className={`${s.sub} font-medium uppercase tracking-[0.12em] opacity-70`}>
          Shahjalal Islami Bank PLC
        </div>
      </div>
    </div>
  );
}

/** Joint-venture attribution, as submitted in the bid. */
export function JvCredit({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      Delivered by <strong className="font-semibold">U Fintech</strong> &nbsp;·&nbsp;{" "}
      <strong className="font-semibold">Harvest Partners</strong> &nbsp;·&nbsp;{" "}
      <strong className="font-semibold">Nascenia</strong>
    </span>
  );
}

export function BankLetterhead({ division = "Common Services Division", children }: {
  division?: string; children?: ReactNode;
}) {
  return (
    <div className="border-b-2 border-brand-700 pb-3">
      <div className="flex items-center gap-3">
        <BankMark className="h-11 w-11 text-brand-700" />
        <div className="leading-tight">
          <div className="text-[19px] font-bold tracking-[-0.01em] text-brand-800">
            Shahjalal Islami Bank PLC.
          </div>
          <div className="text-[12.5px] text-ink-600">{division}, Corporate Head Office, Dhaka</div>
        </div>
      </div>
      {children}
    </div>
  );
}
