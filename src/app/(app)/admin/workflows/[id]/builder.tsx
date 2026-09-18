"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveWorkflowVersion, simulateRoute, activateVersion } from "@/lib/workflow-actions";
import { formatBDT, parseTakaToPoisha } from "@/lib/money";
import { formatDate } from "@/lib/date";
import { CONDITION_TYPE, ACTION_TYPE, label as enumLabel } from "@/lib/enums";
import { Card, CardHeader, Icon, Pill, buttonClass, Note } from "@/components/ui";
import { ControlRefusal, SuccessBanner, type Refusal } from "@/components/control-refusal";

export interface BuilderStep {
  key: string; sequence: number; name: string;
  conditionType: string; conditionValue: string;
  requiredRoleId: string; actionType: string; escalationHours: number;
}
export interface RoleOption { id: string; name: string }

interface SimStep {
  sequence: number; name: string; roleName: string;
  applies: boolean; reason: string; actionType: string;
}

/**
 * THE WORKFLOW BUILDER.
 *
 * This screen carries the commercial argument in the bid, so two things matter
 * more than anything else:
 *
 *  1. It must be usable live on stage in under thirty seconds. Large controls,
 *     no nested menus, no modal stacking, one visible Save.
 *
 *  2. The consequence of a change must be visible BEFORE saving. The simulator
 *     on the right re-resolves the route on every keystroke, using the same
 *     resolveRoute the engine runs at runtime rather than a parallel copy that
 *     could drift. Changing a threshold and watching an approval tier appear
 *     is the argument, and it costs the presenter no clicks at all.
 */
export function Builder({
  definitionId, documentType, version, isActive, initialSteps, roles,
  departments, categories, versions, inFlightCount, canConfigure,
}: {
  definitionId: string; documentType: string; version: number; isActive: boolean;
  initialSteps: BuilderStep[]; roles: RoleOption[];
  departments: Array<{ code: string; name: string }>;
  categories: Array<{ code: string; name: string }>;
  versions: Array<{ id: string; version: number; isActive: boolean; description: string; createdAt: string }>;
  inFlightCount: number; canConfigure: boolean;
}) {
  const [steps, setSteps] = useState<BuilderStep[]>(initialSteps);
  const [note, setNote] = useState("");
  const [testAmount, setTestAmount] = useState("17,77,500");
  const [testDept, setTestDept] = useState("");
  const [testCategory, setTestCategory] = useState("");
  const [sim, setSim] = useState<SimStep[]>([]);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const dirty = JSON.stringify(steps) !== JSON.stringify(initialSteps);

  // Re-simulate whenever the rules or the test document change.
  const runSim = useCallback(() => {
    const facts = {
      amount: parseTakaToPoisha(testAmount),
      departmentCode: testDept || undefined,
      departmentName: departments.find(d => d.code === testDept)?.name,
      categoryCode: testCategory || undefined,
      categoryName: categories.find(c => c.code === testCategory)?.name,
    };
    simulateRoute(
      steps.map(s => ({
        sequence: s.sequence, name: s.name, conditionType: s.conditionType,
        conditionValue: s.conditionValue, requiredRoleId: s.requiredRoleId,
        actionType: s.actionType, escalationHours: s.escalationHours,
      })),
      facts,
    ).then(setSim).catch(() => setSim([]));
  }, [steps, testAmount, testDept, testCategory, departments, categories]);

  useEffect(() => { runSim(); }, [runSim]);

  const update = (key: string, patch: Partial<BuilderStep>) =>
    setSteps(ss => ss.map(s => (s.key === key ? { ...s, ...patch } : s)));

  const addStep = () =>
    setSteps(ss => [...ss, {
      key: `new-${ss.length}-${ss.reduce((m, s) => m + s.sequence, 0)}`,
      sequence: ss.length + 1,
      name: "New approval step",
      conditionType: "ALWAYS",
      conditionValue: "",
      requiredRoleId: roles[0]?.id ?? "",
      actionType: "APPROVE",
      escalationHours: 48,
    }]);

  const removeStep = (key: string) =>
    setSteps(ss => ss.filter(s => s.key !== key).map((s, i) => ({ ...s, sequence: i + 1 })));

  const move = (key: string, dir: -1 | 1) =>
    setSteps(ss => {
      const i = ss.findIndex(s => s.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ss.length) return ss;
      const next = ss.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next.map((s, k) => ({ ...s, sequence: k + 1 }));
    });

  const save = () => {
    setRefusal(null); setSuccess(null);
    start(async () => {
      const res = await saveWorkflowVersion(
        definitionId,
        steps.map(s => ({
          sequence: s.sequence, name: s.name, conditionType: s.conditionType,
          conditionValue: s.conditionValue, requiredRoleId: s.requiredRoleId,
          actionType: s.actionType, escalationHours: s.escalationHours,
        })),
        note,
      );
      if (res.ok && res.newVersionId) {
        router.push(`/admin/workflows/${res.newVersionId}`);
        router.refresh();
      } else setRefusal(res);
    });
  };

  const applying = sim.filter(s => s.applies);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* ------------------------------ RULES ------------------------------ */}
      <div className="space-y-4 lg:col-span-3">
        {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
        {success ? <SuccessBanner message={success} onDismiss={() => setSuccess(null)} /> : null}

        {!isActive ? (
          <Note tone="warn" title="This is a superseded version">
            You are viewing an earlier version. Editing it will still save as a new version and
            make that one active.
          </Note>
        ) : null}

        <Card pad={false}>
          <CardHeader
            title="Approval steps"
            subtitle="Evaluated in order against each document at the moment it is submitted"
            action={canConfigure ? (
              <button type="button" onClick={addStep} className={buttonClass("secondary")}>
                <Icon name="plus" className="h-4 w-4" /> Add step
              </button>
            ) : undefined}
          />

          <div className="divide-y divide-ink-200">
            {steps.map((s, i) => {
              const simStep = sim.find(x => x.sequence === s.sequence);
              const applies = simStep?.applies ?? true;
              return (
                <div key={s.key} className={`p-4 ${applies ? "" : "bg-ink-50"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold ${
                      applies ? "bg-brand-700 text-white" : "bg-ink-200 text-ink-500"
                    }`}>
                      {s.sequence}
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={s.name}
                          disabled={!canConfigure}
                          onChange={e => update(s.key, { name: e.target.value })}
                          className="min-w-[200px] flex-1 rounded-[5px] border border-ink-300 px-3 py-2 text-[14px] font-semibold text-ink-900 focus:border-brand-500 disabled:bg-ink-50"
                        />
                        {canConfigure ? (
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => move(s.key, -1)} disabled={i === 0}
                              className="rounded p-1.5 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move up">
                              <Icon name="arrowLeft" className="h-4 w-4 rotate-90" />
                            </button>
                            <button type="button" onClick={() => move(s.key, 1)} disabled={i === steps.length - 1}
                              className="rounded p-1.5 text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Move down">
                              <Icon name="arrowRight" className="h-4 w-4 rotate-90" />
                            </button>
                            <button type="button" onClick={() => removeStep(s.key)}
                              className="rounded p-1.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600" aria-label="Remove step">
                              <Icon name="x" className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-12">
                        {/* Condition */}
                        <div className="sm:col-span-5">
                          <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                            Applies when
                          </label>
                          <select
                            value={s.conditionType}
                            disabled={!canConfigure}
                            onChange={e => update(s.key, { conditionType: e.target.value, conditionValue: "" })}
                            className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-2 text-[13.5px] focus:border-brand-500 disabled:bg-ink-50"
                          >
                            {CONDITION_TYPE.map(c => <option key={c} value={c}>{enumLabel(c)}</option>)}
                          </select>
                        </div>

                        {/* Condition value */}
                        <div className="sm:col-span-3">
                          <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                            {s.conditionType.startsWith("AMOUNT") ? "Threshold (৳)" : "Value"}
                          </label>
                          {s.conditionType === "ALWAYS" ? (
                            <div className="rounded-[5px] border border-ink-200 bg-ink-50 px-2.5 py-2 text-[13.5px] text-ink-400">—</div>
                          ) : s.conditionType === "DEPARTMENT_IS" ? (
                            <select
                              value={s.conditionValue} disabled={!canConfigure}
                              onChange={e => update(s.key, { conditionValue: e.target.value })}
                              className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-2 text-[13.5px] focus:border-brand-500 disabled:bg-ink-50"
                            >
                              <option value="">Select…</option>
                              {departments.map(d => <option key={d.code} value={d.code}>{d.code}</option>)}
                            </select>
                          ) : s.conditionType === "CATEGORY_IS" ? (
                            <select
                              value={s.conditionValue} disabled={!canConfigure}
                              onChange={e => update(s.key, { conditionValue: e.target.value })}
                              className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-2 text-[13.5px] focus:border-brand-500 disabled:bg-ink-50"
                            >
                              <option value="">Select…</option>
                              {categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                            </select>
                          ) : (
                            <input
                              value={s.conditionValue ? String(Number(s.conditionValue) / 100) : ""}
                              disabled={!canConfigure}
                              onChange={e => update(s.key, { conditionValue: String(parseTakaToPoisha(e.target.value)) })}
                              placeholder="500000"
                              className="w-full rounded-[5px] border border-ink-300 px-2.5 py-2 text-[13.5px] tabular focus:border-brand-500 disabled:bg-ink-50"
                            />
                          )}
                        </div>

                        {/* Role */}
                        <div className="sm:col-span-4">
                          <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                            Actioned by
                          </label>
                          <select
                            value={s.requiredRoleId} disabled={!canConfigure}
                            onChange={e => update(s.key, { requiredRoleId: e.target.value })}
                            className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-2 text-[13.5px] focus:border-brand-500 disabled:bg-ink-50"
                          >
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>

                        <div className="sm:col-span-5">
                          <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                            Action
                          </label>
                          <select
                            value={s.actionType} disabled={!canConfigure}
                            onChange={e => update(s.key, { actionType: e.target.value })}
                            className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-2 text-[13.5px] focus:border-brand-500 disabled:bg-ink-50"
                          >
                            {ACTION_TYPE.map(a => <option key={a} value={a}>{enumLabel(a)}</option>)}
                          </select>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                            Escalate after
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min={1} value={s.escalationHours} disabled={!canConfigure}
                              onChange={e => update(s.key, { escalationHours: Number(e.target.value) || 48 })}
                              className="w-full rounded-[5px] border border-ink-300 px-2.5 py-2 text-[13.5px] tabular focus:border-brand-500 disabled:bg-ink-50"
                            />
                            <span className="shrink-0 text-[12.5px] text-ink-500">hrs</span>
                          </div>
                        </div>
                      </div>

                      {simStep && !simStep.applies ? (
                        <div className="rounded-[4px] bg-ink-100 px-2.5 py-1.5 text-[12px] text-ink-600">
                          <Icon name="x" className="mr-1 inline h-3 w-3 align-[-2px]" />
                          Skipped for the test document: {simStep.reason}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {canConfigure ? (
            <div className="border-t border-ink-200 bg-ink-50 p-4">
              <label htmlFor="note" className="mb-1.5 block text-[12.5px] font-semibold text-ink-700">
                Reason for this change (recorded in the audit trail)
              </label>
              <input
                id="note" value={note} onChange={e => setNote(e.target.value)}
                placeholder="Divisional tier lowered to ৳ 1,00,000 per the revised delegation of authority."
                className="w-full rounded-[5px] border border-ink-300 px-3 py-2 text-[13.5px] focus:border-brand-500"
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button" onClick={save} disabled={pending || !dirty}
                  className={buttonClass("primary", "px-5 py-2.5 text-[14px]")}
                >
                  <Icon name="check" className="h-4 w-4" />
                  {pending ? "Saving…" : `Save as version ${version + 1}`}
                </button>
                {dirty ? (
                  <button type="button" onClick={() => { setSteps(initialSteps); setNote(""); }}
                    className={buttonClass("ghost")}>
                    Discard changes
                  </button>
                ) : (
                  <span className="text-[12.5px] text-ink-500">No changes to save.</span>
                )}
                {inFlightCount > 0 ? (
                  <span className="ml-auto text-[12.5px] text-ink-600">
                    <Icon name="shield" className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-brand-600" />
                    {inFlightCount} document{inFlightCount === 1 ? "" : "s"} in approval will stay on version {version}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        {/* Version history */}
        <Card pad={false}>
          <CardHeader title="Version history" subtitle="Nothing is ever overwritten" />
          <ul className="divide-y divide-ink-100">
            {versions.map(v => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <Link href={`/admin/workflows/${v.id}`}
                    className={`font-mono text-[13px] font-semibold ${v.id === definitionId ? "text-ink-900" : "text-brand-700 hover:underline"}`}>
                    v{v.version}
                  </Link>
                  <span className="ml-3 text-[12.5px] text-ink-600">{v.description}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[12px] text-ink-500">{formatDate(v.createdAt)}</span>
                  {v.isActive ? <Pill tone="success">Active</Pill> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ---------------------------- SIMULATOR ---------------------------- */}
      <div className="lg:col-span-2">
        <div className="sticky top-0 space-y-4">
          <Card pad={false} className="border-brand-500/40">
            <CardHeader
              className="bg-brand-50"
              title={
                <span className="flex items-center gap-2">
                  <Icon name="eye" className="h-4 w-4 text-brand-700" />
                  Routing preview
                </span>
              }
              subtitle="Live, against the rules above — before anything is saved"
            />

            <div className="space-y-3 border-b border-ink-200 p-4">
              <div>
                <label htmlFor="amt" className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                  Test document value (৳)
                </label>
                <input
                  id="amt" value={testAmount} onChange={e => setTestAmount(e.target.value)}
                  className="w-full rounded-[5px] border border-ink-300 px-3 py-2.5 text-[17px] font-semibold tabular focus:border-brand-500"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {["80,000", "3,00,000", "17,77,500", "25,00,000"].map(v => (
                    <button key={v} type="button" onClick={() => setTestAmount(v)}
                      className={`rounded-[4px] border px-2 py-0.5 text-[11.5px] font-medium transition-colors ${
                        testAmount === v ? "border-brand-600 bg-brand-100 text-brand-800" : "border-ink-300 text-ink-600 hover:bg-ink-50"
                      }`}>
                      ৳ {v}
                    </button>
                  ))}
                </div>
              </div>

              {steps.some(s => s.conditionType === "DEPARTMENT_IS") ? (
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                    Test division
                  </label>
                  <select value={testDept} onChange={e => setTestDept(e.target.value)}
                    className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-2 text-[13.5px]">
                    <option value="">Any</option>
                    {departments.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
                  </select>
                </div>
              ) : null}

              {steps.some(s => s.conditionType === "CATEGORY_IS") ? (
                <div>
                  <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-500">
                    Test item category
                  </label>
                  <select value={testCategory} onChange={e => setTestCategory(e.target.value)}
                    className="w-full rounded-[5px] border border-ink-300 bg-white px-2.5 py-2 text-[13.5px]">
                    <option value="">Any</option>
                    {categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="p-4">
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-500">
                  Resulting route
                </span>
                <span className="text-[13px] font-bold text-ink-900">
                  {applying.length} approval{applying.length === 1 ? "" : "s"}
                </span>
              </div>

              <ol className="space-y-0">
                {sim.map((s, i) => (
                  <li key={s.sequence} className="relative flex gap-2.5 pb-3 last:pb-0">
                    {i < sim.length - 1 ? (
                      <span aria-hidden="true"
                        className={`absolute left-[10px] top-[22px] h-[calc(100%-16px)] w-px ${s.applies ? "bg-brand-400" : "bg-ink-200"}`} />
                    ) : null}
                    <span className={`relative z-10 mt-0.5 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-2 text-[10.5px] font-bold ${
                      s.applies ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-ink-100 text-ink-400"
                    }`}>
                      {s.applies ? applying.findIndex(a => a.sequence === s.sequence) + 1 : "–"}
                    </span>
                    <div className={`min-w-0 flex-1 ${s.applies ? "" : "opacity-55"}`}>
                      <div className={`text-[13px] font-semibold ${s.applies ? "text-ink-900" : "text-ink-500 line-through decoration-ink-300"}`}>
                        {s.name}
                      </div>
                      <div className="text-[12px] text-ink-500">{s.roleName}</div>
                      <div className={`mt-0.5 text-[11.5px] leading-snug ${s.applies ? "text-brand-700" : "text-ink-500"}`}>
                        {s.reason}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              {applying.length === 0 ? (
                <div className="rounded-[5px] bg-danger-50 px-3 py-2 text-[12.5px] text-danger-700">
                  No step applies to this document. A workflow that produces no approval step will
                  be refused at submission.
                </div>
              ) : null}
            </div>
          </Card>

          <Note tone="neutral" title="What this proves">
            The preview runs the same routing engine the system uses at runtime, not a separate
            copy of the logic. Whatever it shows here is what the next document will actually do.
          </Note>
        </div>
      </div>
    </div>
  );
}
