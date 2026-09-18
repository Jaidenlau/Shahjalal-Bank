"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitIntentionToBid } from "@/lib/vendor-actions";
import { Icon } from "@/components/ui";
import { ControlRefusal, type Refusal } from "@/components/control-refusal";

export function IntentionButton({ tenderId }: { tenderId: string }) {
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <>
      {refusal ? <ControlRefusal refusal={refusal} onDismiss={() => setRefusal(null)} /> : null}
      <button
        type="button" disabled={pending}
        onClick={() => start(async () => {
          const res = await submitIntentionToBid(tenderId);
          if (res.ok) router.refresh(); else setRefusal(res);
        })}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] border border-ink-300 bg-white px-4 py-2 text-[13.5px] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
      >
        <Icon name="check" className="h-4 w-4" />
        {pending ? "Registering…" : "Register intention to bid"}
      </button>
    </>
  );
}
