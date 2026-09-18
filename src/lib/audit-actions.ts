"use server";

import { prisma } from "./db";
import { requireUser, assertCan } from "./auth";
import { verifyChain, sha256, rowDigestInput } from "./audit";

/**
 * Audit trail verification.
 *
 * There is no update or delete action in this file, and none anywhere else in
 * the application, for any role including administrators. The AuditLog table is
 * written by writeAudit and read by the viewer. That is the whole surface.
 */

export interface VerifyResult {
  ok: boolean;
  checked: number;
  firstBrokenId: number | null;
  reason: string;
  from: string | null;
  to: string | null;
  durationMs: number;
}

export async function verifyAuditChain(): Promise<VerifyResult> {
  const user = await requireUser();
  assertCan(user, "AUDIT", "VIEW");

  const started = Date.now();
  const result = await verifyChain(prisma);
  return {
    ok: result.ok,
    checked: result.checked,
    firstBrokenId: result.firstBrokenId,
    reason: result.reason,
    from: result.from?.toISOString() ?? null,
    to: result.to?.toISOString() ?? null,
    durationMs: Date.now() - started,
  };
}

/**
 * Recompute one record's hash and show the working.
 *
 * This is the answer to "how do I know the verification is real". It returns
 * the exact bytes that were hashed and the digest they produce, so the result
 * can be checked by hand against the stored value.
 */
export async function explainRecord(id: number) {
  const user = await requireUser();
  assertCan(user, "AUDIT", "VIEW");

  const row = await prisma.auditLog.findUnique({ where: { id } });
  if (!row) return null;

  const input = rowDigestInput({
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    performedByName: row.performedByName,
    performedByRole: row.performedByRole,
    previousValue: row.previousValue,
    newValue: row.newValue,
    timestamp: row.timestamp,
    previousHash: row.previousHash,
  });
  const recomputed = sha256(input);

  return {
    id: row.id,
    storedHash: row.hash,
    previousHash: row.previousHash,
    recomputed,
    matches: recomputed === row.hash,
    // Rendered with the unit separator made visible, so the structure is legible.
    digestInput: input.replace(/␟/g, " ⟪|⟫ "),
  };
}
