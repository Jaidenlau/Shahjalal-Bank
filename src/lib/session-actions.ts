"use server";

import { redirect } from "next/navigation";
import { prisma } from "./db";
import { authenticate, createSession, destroySession, currentUser } from "./auth";
import { writeAudit } from "./audit";

/** Sign in as a bank employee. */
export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticate(email, password, "internal");
  if (!user) return { error: "The email address or password is not recognised." };

  await prisma.$transaction(async tx => {
    const roles = await tx.userRole.findMany({
      where: { userId: user.id }, orderBy: { sequence: "asc" }, include: { role: true },
    });
    await writeAudit(tx, {
      entityType: "User", entityId: user.id, entityLabel: user.fullName,
      action: "USER_SIGNED_IN", performedById: user.id,
      performedByName: user.fullName,
      performedByRole: roles[0]?.role.name ?? "Officer",
      newValue: { channel: "Web", email: user.email },
    });
  });

  await createSession(user.id, "internal");
  redirect("/");
}

/** Sign in as a vendor, into the external portal. */
export async function vendorSignIn(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await authenticate(email, password, "vendor");
  if (!user) return { error: "The email address or password is not recognised." };

  const vu = await prisma.vendorUser.findUnique({
    where: { userId: user.id }, include: { vendor: true },
  });

  await prisma.$transaction(async tx => {
    await writeAudit(tx, {
      entityType: "Vendor", entityId: vu?.vendorId ?? user.id,
      entityLabel: vu?.vendor.companyName ?? user.fullName,
      action: "VENDOR_SIGNED_IN", performedById: user.id,
      performedByName: vu?.vendor.companyName ?? user.fullName,
      performedByRole: "Vendor",
      ipAddress: "203.112.18.44",
      newValue: { channel: "Vendor Portal", representative: user.fullName },
    });
  });

  await createSession(user.id, "vendor");
  redirect("/vendor");
}

export async function signOut() {
  const user = await currentUser();
  if (user) {
    await prisma.$transaction(async tx => {
      await writeAudit(tx, {
        entityType: "User", entityId: user.id, entityLabel: user.fullName,
        action: "USER_SIGNED_OUT", performedById: user.id,
        performedByName: user.fullName, performedByRole: user.roleName,
        newValue: { channel: "Web" },
      });
    });
  }
  await destroySession("internal");
  redirect("/login");
}

export async function vendorSignOut() {
  await destroySession("vendor");
  redirect("/vendor/login");
}

/**
 * Demo persona switch.
 *
 * A convenience for the presenter so fifteen minutes is not spent typing
 * passwords, and it is labelled as such on screen. It creates an ordinary
 * session for the target user and writes an audit row recording who switched,
 * so it does not become a hole in the trail.
 */
export async function switchPersona(userId: string) {
  const from = await currentUser();
  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { orderBy: { sequence: "asc" }, include: { role: true } } },
  });
  if (!target || target.userType !== "INTERNAL") return;

  await prisma.$transaction(async tx => {
    await writeAudit(tx, {
      entityType: "User", entityId: target.id, entityLabel: target.fullName,
      action: "DEMO_PERSONA_SWITCHED", performedById: target.id,
      performedByName: target.fullName,
      performedByRole: target.roles[0]?.role.name ?? "Officer",
      previousValue: from ? { signedInAs: from.fullName, role: from.roleName } : undefined,
      newValue: { signedInAs: target.fullName },
    });
  });

  await createSession(target.id, "internal");
}
