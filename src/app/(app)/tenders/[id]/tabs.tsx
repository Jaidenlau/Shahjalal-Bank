import Link from "next/link";

export function TenderTabs({
  tabs, active, basePath,
}: {
  tabs: Array<{ key: string; label: string; highlight?: boolean }>;
  active: string; basePath: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-ink-200">
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${basePath}?tab=${t.key}`}
            className={`relative -mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
              on
                ? "border-brand-600 text-brand-800"
                : "border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900"
            }`}
          >
            {t.label}
            {t.highlight ? <span className="h-1.5 w-1.5 rounded-full bg-gold-500" /> : null}
          </Link>
        );
      })}
    </div>
  );
}
