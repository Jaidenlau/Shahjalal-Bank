import { formatBDTCompact } from "@/lib/money";
import { label as enumLabel, tone as statusTone, type Tone } from "@/lib/enums";

/**
 * Charts, drawn as inline SVG.
 *
 * No charting library and no CDN: the venue may have no network, and a chart
 * that fails to render mid-demo is worse than no chart. These are small enough
 * to hand-draw and they read correctly on a projector.
 */

const TONE_FILL: Record<Tone, string> = {
  neutral: "var(--color-ink-400)",
  info: "var(--color-info-500)",
  warn: "var(--color-warn-500)",
  success: "var(--color-brand-500)",
  danger: "var(--color-danger-500)",
  sealed: "var(--color-gold-500)",
};

export function StatusBars({
  data, total,
}: { data: Array<{ status: string; count: number }>; total?: number }) {
  const sum = total ?? data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map(d => d.count));
  const sorted = data.slice().sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-2">
      {sorted.map(d => {
        const pct = (d.count / max) * 100;
        return (
          <div key={d.status} className="flex items-center gap-3">
            <div className="w-[152px] shrink-0 truncate text-right text-[12.5px] text-ink-600">
              {enumLabel(d.status)}
            </div>
            <div className="h-[18px] flex-1 overflow-hidden rounded-[3px] bg-ink-100">
              <div
                className="h-full rounded-[3px] transition-[width]"
                style={{ width: `${Math.max(pct, 2)}%`, background: TONE_FILL[statusTone(d.status)] }}
              />
            </div>
            <div className="w-[64px] shrink-0 text-right text-[12.5px] font-semibold text-ink-800 tabular">
              {d.count}
              <span className="ml-1 font-normal text-ink-400">
                {sum ? `${Math.round((d.count / sum) * 100)}%` : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Budget allocation vs consumption by division. */
export function SpendBars({
  data,
}: { data: Array<{ code: string; name: string; allocated: number; consumed: number }> }) {
  const max = Math.max(1, ...data.map(d => d.allocated));
  return (
    <div className="space-y-2.5">
      {data.map(d => {
        const usedPct = d.allocated ? (d.consumed / d.allocated) * 100 : 0;
        const barPct = (d.allocated / max) * 100;
        const hot = usedPct > 80;
        return (
          <div key={d.code}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate font-medium text-ink-800" title={d.name}>{d.code}</span>
              <span className="shrink-0 text-ink-500 tabular">
                <span className={hot ? "font-semibold text-warn-700" : "font-semibold text-ink-700"}>
                  {formatBDTCompact(d.consumed)}
                </span>
                {" of "}
                {formatBDTCompact(d.allocated)}
              </span>
            </div>
            <div className="h-[16px] overflow-hidden rounded-[3px] bg-ink-100" style={{ width: `${Math.max(barPct, 12)}%` }}>
              <div
                className="h-full rounded-[3px]"
                style={{
                  width: `${Math.min(usedPct, 100)}%`,
                  background: hot ? "var(--color-warn-500)" : "var(--color-brand-500)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Budget consumption ring for the dashboard tile. */
export function BudgetRing({
  allocated, consumed, committed, size = 132,
}: { allocated: number; consumed: number; committed: number; size?: number }) {
  const r = size / 2 - 11;
  const c = 2 * Math.PI * r;
  const consumedPct = allocated ? consumed / allocated : 0;
  const committedPct = allocated ? committed / allocated : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-100)" strokeWidth="11" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-gold-400)" strokeWidth="11"
          strokeDasharray={`${c * Math.min(consumedPct + committedPct, 1)} ${c}`} strokeLinecap="butt"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-brand-600)" strokeWidth="11"
          strokeDasharray={`${c * Math.min(consumedPct, 1)} ${c}`} strokeLinecap="butt"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[21px] font-bold leading-none text-ink-950 tabular">
          {Math.round(consumedPct * 100)}%
        </div>
        <div className="mt-0.5 text-[11.5px] uppercase tracking-[0.06em] text-ink-500">consumed</div>
      </div>
    </div>
  );
}

/** Simple sparkline for trend tiles. */
export function Sparkline({
  values, width = 160, height = 34,
}: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        points={pts.join(" ")} fill="none" stroke="var(--color-brand-500)"
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  );
}
