import Link from "next/link";
import type { ReactNode } from "react";
import { formatBDT, formatBDTCompact } from "@/lib/money";
import { label as enumLabel, tone as statusTone, type Tone } from "@/lib/enums";

/* Shared presentation primitives. Everything is a server component unless it
   needs interactivity, so the demo renders in one pass with no loading flicker
   on a projector. */

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-300",
  info: "bg-info-100 text-info-700 ring-info-500/30",
  warn: "bg-warn-100 text-warn-700 ring-warn-500/30",
  success: "bg-brand-100 text-brand-800 ring-brand-500/30",
  danger: "bg-danger-100 text-danger-700 ring-danger-500/30",
  sealed: "bg-gold-100 text-gold-700 ring-gold-500/40",
};

export function Pill({
  status, children, tone, className = "",
}: { status?: string; children?: ReactNode; tone?: Tone; className?: string }) {
  const t = tone ?? statusTone(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ring-1 ring-inset whitespace-nowrap ${TONE_CLASS[t]} ${className}`}
    >
      {children ?? enumLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function Money({
  value, compact = false, className = "", muted = false,
}: { value: number; compact?: boolean; className?: string; muted?: boolean }) {
  return (
    <span className={`money whitespace-nowrap ${muted ? "text-ink-500" : ""} ${className}`}>
      {compact ? formatBDTCompact(value) : formatBDT(value)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({
  children, className = "", pad = true,
}: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={`rounded-[6px] border border-ink-200 bg-white shadow-[0_1px_2px_rgba(10,20,16,0.04)] ${pad ? "p-5" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title, subtitle, action, className = "",
}: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3.5 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow, title, subtitle, actions, meta,
}: {
  eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode;
  actions?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-600">{eyebrow}</div>
          ) : null}
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink-950">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-3xl text-[14px] text-ink-600">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5">{meta}</div> : null}
    </header>
  );
}

export function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium uppercase tracking-[0.05em] text-ink-500">{label}</dt>
      <dd className={`mt-0.5 text-[14px] text-ink-900 ${mono ? "font-mono text-[13px]" : ""}`}>{children}</dd>
    </div>
  );
}

export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 text-[13px]">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-ink-900">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 border-brand-700",
  secondary: "bg-white text-ink-800 hover:bg-ink-50 border-ink-300",
  ghost: "bg-transparent text-ink-700 hover:bg-ink-100 border-transparent",
  danger: "bg-danger-600 text-white hover:bg-danger-700 border-danger-600",
};

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[5px] border px-3.5 py-[7px] text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45";

export function ButtonLink({
  href, children, variant = "secondary", className = "",
}: { href: string; children: ReactNode; variant?: BtnVariant; className?: string }) {
  return (
    <Link href={href} className={`${BTN_BASE} ${BTN[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function buttonClass(variant: BtnVariant = "secondary", className = "") {
  return `${BTN_BASE} ${BTN[variant]} ${className}`;
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  );
}

/* Alignment classes are written out in full rather than interpolated: Tailwind
   scans source text for literal class names, so `text-${align}` would compile
   to nothing and every column would silently fall back to left aligned. */
const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;
type Align = keyof typeof ALIGN;

export function Th({
  children, align = "left", className = "", width,
}: { children?: ReactNode; align?: Align; className?: string; width?: string }) {
  return (
    <th
      style={width ? { width } : undefined}
      className={`border-b border-ink-200 bg-ink-50 px-3 py-2.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-600 ${ALIGN[align]} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children, align = "left", className = "", mono = false,
}: { children?: ReactNode; align?: Align; className?: string; mono?: boolean }) {
  return (
    <td className={`border-b border-ink-100 px-3 py-2.5 align-middle ${ALIGN[align]} ${mono ? "font-mono text-[12.5px]" : ""} ${className}`}>
      {children}
    </td>
  );
}

export function Tr({
  children, className = "", href,
}: { children: ReactNode; className?: string; href?: string }) {
  if (href) {
    return (
      <tr className={`group transition-colors hover:bg-brand-50/60 ${className}`}>
        {children}
      </tr>
    );
  }
  return <tr className={`transition-colors hover:bg-ink-50/70 ${className}`}>{children}</tr>;
}

/** A cell whose whole area links, so table rows are clickable without JS. */
export function LinkCell({ href, children, className = "", mono = false }: {
  href: string; children: ReactNode; className?: string; mono?: boolean;
}) {
  return (
    <Td className={className} mono={mono}>
      <Link href={href} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
        {children}
      </Link>
    </Td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-10 text-center text-[13.5px] text-ink-500">
        {children}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

export function Stat({
  label, value, sub, tone = "neutral", href,
}: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string }) {
  const accent: Record<Tone, string> = {
    neutral: "border-l-ink-300", info: "border-l-info-500", warn: "border-l-warn-500",
    success: "border-l-brand-500", danger: "border-l-danger-500", sealed: "border-l-gold-500",
  };
  const inner = (
    <div className={`h-full rounded-[6px] border border-ink-200 border-l-[3px] ${accent[tone]} bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(10,20,16,0.04)] transition-shadow ${href ? "hover:shadow-[0_2px_8px_rgba(10,20,16,0.09)]" : ""}`}>
      <div className="text-[12px] font-medium uppercase tracking-[0.05em] text-ink-500">{label}</div>
      <div className="mt-1 text-[24px] font-bold leading-none tracking-[-0.02em] text-ink-950 tabular">{value}</div>
      {sub ? <div className="mt-1.5 text-[12.5px] text-ink-500">{sub}</div> : null}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

// ---------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------

export function Note({
  tone = "info", title, children, reference,
}: { tone?: Tone; title?: ReactNode; children: ReactNode; reference?: string }) {
  const map: Record<Tone, string> = {
    neutral: "border-ink-300 bg-ink-50 text-ink-800",
    info: "border-info-500/40 bg-info-50 text-info-700",
    warn: "border-warn-500/40 bg-warn-50 text-warn-700",
    success: "border-brand-500/40 bg-brand-50 text-brand-800",
    danger: "border-danger-500/40 bg-danger-50 text-danger-700",
    sealed: "border-gold-500/50 bg-gold-50 text-gold-700",
  };
  return (
    <div className={`rounded-[6px] border px-4 py-3 text-[13.5px] ${map[tone]}`}>
      {title ? <div className="mb-1 font-semibold">{title}</div> : null}
      <div className="leading-relaxed">{children}</div>
      {reference ? (
        <div className="mt-2 border-t border-current/15 pt-2 text-[12px] opacity-80">{reference}</div>
      ) : null}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-600">{children}</h3>
      {hint ? <span className="text-[12.5px] text-ink-500">{hint}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons — inline SVG only. No icon font, no CDN, nothing to fail offline.
// ---------------------------------------------------------------------------

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export type IconName =
  | "lock" | "unlock" | "check" | "x" | "alert" | "clock" | "file" | "download"
  | "chevronRight" | "chevronDown" | "arrowRight" | "arrowLeft" | "plus" | "search"
  | "bell" | "user" | "logout" | "shield" | "chart" | "settings" | "print"
  | "link" | "eye" | "refresh" | "filter" | "box" | "truck" | "building";

const PATHS: Record<IconName, ReactNode> = {
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  unlock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 7.6-1.7" /></>,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  x: <path d="M5.5 5.5l13 13m0-13l-13 13" />,
  alert: <><path d="M12 3.5L22 20H2L12 3.5z" /><path d="M12 10v4.5" /><path d="M12 17.2v.3" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></>,
  file: <><path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5L14 3.5z" /><path d="M13.8 3.6V8h4.1" /></>,
  download: <><path d="M12 4v11" /><path d="M7.5 11l4.5 4.5 4.5-4.5" /><path d="M5 19.5h14" /></>,
  chevronRight: <path d="M9.5 5.5l6.5 6.5-6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5l6.5 6.5 6.5-6.5" />,
  arrowRight: <><path d="M4.5 12h15" /><path d="M13.5 6l6 6-6 6" /></>,
  arrowLeft: <><path d="M19.5 12h-15" /><path d="M10.5 6l-6 6 6 6" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  bell: <><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5z" /><path d="M10 18.5a2.2 2.2 0 0 0 4 0" /></>,
  user: <><circle cx="12" cy="8.5" r="3.7" /><path d="M4.8 20c0-3.6 3.2-5.7 7.2-5.7s7.2 2.1 7.2 5.7" /></>,
  logout: <><path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" /><path d="M17 8l4 4-4 4" /><path d="M21 12H10" /></>,
  shield: <><path d="M12 3.5l7 2.7v5c0 4.6-3 8-7 9.3-4-1.3-7-4.7-7-9.3v-5l7-2.7z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  chart: <><path d="M4.5 19.5h15" /><path d="M7.5 19.5V11" /><path d="M12 19.5V5.5" /><path d="M16.5 19.5v-5.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5" /></>,
  print: <><path d="M7 9.5V4h10v5.5" /><rect x="4" y="9.5" width="16" height="7" rx="1.5" /><path d="M7 14h10v6H7z" /></>,
  link: <><path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.5-2.5a4 4 0 0 0-5.7-5.7l-1.4 1.4" /><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.5 2.5a4 4 0 0 0 5.7 5.7l1.4-1.4" /></>,
  eye: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.8" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4.5h-4.5" /></>,
  filter: <path d="M3.5 5.5h17l-6.5 7.5v5.5l-4 2v-7.5z" />,
  box: <><path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4v-9z" /><path d="M3.5 7.5L12 11.5l8.5-4" /><path d="M12 11.5v9" /></>,
  truck: <><path d="M2.5 6.5h11v10h-11z" /><path d="M13.5 10h4l3 3v3.5h-7z" /><circle cx="6.5" cy="18.5" r="1.8" /><circle cx="17" cy="18.5" r="1.8" /></>,
  building: <><path d="M4.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14.5 5v15.5" /><path d="M14.5 10h3.5A1.5 1.5 0 0 1 19.5 11.5v9" /><path d="M7.5 7.5h4M7.5 11h4M7.5 14.5h4" /><path d="M3 20.5h18" /></>,
};
