"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser, assertCan } from "./auth";
import { runScreening, recordShariahDecision, ShariahAuthorityError } from "./shariah";

/**
 * Shariah governance actions.
 *
 * Note what is NOT here: there is no action that lets anyone other than the
 * Shariah Supervisory Committee record a Shariah decision, and no override for
 * administrators. The check lives in the domain layer and this file simply
 * surfaces the refusal.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  control?: string;
  layer?: string;
  detail?: Record<string, unknown>;
}

export async function rescreenAction(): Promise<ActionResult> {
  const user = await requireUser();
  assertCan(user, "SHARIAH", "VIEW");

  const result = await runScreening({
    id: user.id,
    fullName: user.fullName,
    roleName: user.roleName,
  });

  revalidatePath("/shariah");
  return {
    ok: true,
    message:
      `Screened ${result.screened} document(s) against the Committee's active rules. ` +
      `${result.opened} new flag(s) raised, ${result.resolved} withdrawn.`,
  };
}

export async function decideAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const documentType = String(formData.get("documentType") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const documentLabel = String(formData.get("documentLabel") ?? "");
  const structure = String(formData.get("structure") ?? "NOT_ASSESSED");
  const decision = String(formData.get("decision") ?? "APPROVED") as
    "APPROVED" | "APPROVED_WITH_CONDITIONS" | "REFERRED_BACK";
  const conditions = String(formData.get("conditions") ?? "");
  const reference = String(formData.get("reference") ?? "");

  try {
    await recordShariahDecision({
      documentType, documentId, documentLabel, structure, decision, conditions, reference,
      actor: {
        id: user.id,
        fullName: user.fullName,
        roleName: user.roleName,
        roleCodes: user.roleCodes,
      },
    });
  } catch (e) {
    if (e instanceof ShariahAuthorityError) {
      return { ok: false, message: e.message, control: e.control, layer: e.layer, detail: e.detail };
    }
    throw e;
  }

  revalidatePath("/shariah");
  return { ok: true, message: `Committee decision recorded against ${documentLabel}.` };
}

export async function toggleRuleAction(ruleId: string, isActive: boolean): Promise<ActionResult> {
  const user = await requireUser();
  assertCan(user, "SHARIAH", "CONFIGURE");

  const rule = await prisma.shariahRule.findUnique({ where: { id: ruleId } });
  if (!rule) return { ok: false, message: "Rule not found." };

  await prisma.shariahRule.update({
    where: { id: ruleId },
    data: { isActive, updatedByName: user.fullName },
  });

  revalidatePath("/shariah");
  return {
    ok: true,
    message: `${rule.code} is now ${isActive ? "active" : "inactive"}. Re-run screening to apply it.`,
  };
}
