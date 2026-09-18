import type { ReactNode } from "react";
import { Card, PageHeader, Table, Th, Td, Tr, EmptyRow, Stat, Note } from "./ui";

/**
 * Shared shape for the module registers.
 *
 * The P1 and P2 modules exist so that clicking any navigation item lands on
 * something real. The docs put it well: a visitor log with three rows looks
 * like a prototype, one with forty looks like a bank. This component keeps them
 * consistent without each one being written out longhand.
 */

export interface Column<T> {
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  mono?: boolean;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function Register<T extends { id: string }>({
  eyebrow, title, subtitle, stats, columns, rows, empty, footnote, children, actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  stats?: Array<{ label: string; value: ReactNode; tone?: "neutral" | "info" | "warn" | "success" | "danger" | "sealed"; sub?: ReactNode }>;
  columns: Array<Column<T>>;
  rows: T[];
  empty?: string;
  footnote?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />

      {stats && stats.length > 0 ? (
        // Written out rather than interpolated: Tailwind scans for literal
        // class names, so a computed `lg:grid-cols-${n}` compiles to nothing.
        <div className={`mb-5 grid grid-cols-2 gap-3 ${
          stats.length >= 4 ? "lg:grid-cols-4" : stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
        }`}>
          {stats.map(s => (
            <Stat key={s.label} label={s.label} value={s.value} tone={s.tone} sub={s.sub} />
          ))}
        </div>
      ) : null}

      {children}

      <Card pad={false}>
        <Table>
          <thead>
            <tr>
              {columns.map(c => (
                <Th key={c.header} align={c.align} width={c.width}>{c.header}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={columns.length}>{empty ?? "No records."}</EmptyRow>
            ) : rows.map(r => (
              <Tr key={r.id}>
                {columns.map(c => (
                  <Td key={c.header} align={c.align} mono={c.mono} className={c.className}>
                    {c.cell(r)}
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
        {footnote ? (
          <div className="border-t border-ink-200 px-4 py-2.5 text-[12.5px] text-ink-500">{footnote}</div>
        ) : null}
      </Card>
    </>
  );
}

/**
 * Standing note on the modules that are present and populated but not built
 * through to a deep workflow for this build. Stated on the screen itself rather
 * than left for someone to discover by clicking.
 */
export function ScopeNote({ module, built }: { module: string; built: string }) {
  return (
    <div className="mb-5">
      <Note tone="neutral" title={`${module} in this build`}>
        {built} The full module specified in Annexure-B is delivered in the implementation
        programme; what is shown here is the register and its data, working against the same
        platform, permissions and audit trail as everything else.
      </Note>
    </div>
  );
}
