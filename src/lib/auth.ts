import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual, scryptSync } from "node:crypto";
import { prisma } from "./db";
import { PermissionDenied } from "./errors";
import type { PermissionAction } from "./modules";

/**
 * Session handling.
 *
 * This is a local demo on a single machine, so the session is a signed cookie
 * rather than a server-side store. In the production design described in the
 * technical proposal, authentication integrates with the bank's central IAM
 * over API, and this module is the seam where that plugs in — see
 * /admin/integrations.
 */

const COOKIE = "vertex_session";
const VENDOR_COOKIE = "vertex_vendor_session";
const SECRET = process.env.VERTEX_SESSION_SECRET ?? "vertex-erp-demo-sjibl-2026";

// --- password hashing -------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const derived = scryptSync(password, salt, 32).toString("hex");
  const a = Buffer.from(derived, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- cookie signing ---------------------------------------------------------

function sign(value: string): string {
  return createHash("sha256").update(value + SECRET).digest("hex").slice(0, 32);
}

function encode(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

function decode(raw: string | undefined): string | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return null;
  const id = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  return sign(id) === sig ? id : null;
}

// --- session lifecycle ------------------------------------------------------

export async function createSession(userId: string, kind: "internal" | "vendor" = "internal") {
  const jar = await cookies();
  jar.set(kind === "vendor" ? VENDOR_COOKIE : COOKIE, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function destroySession(kind: "internal" | "vendor" = "internal") {
  const jar = await cookies();
  jar.delete(kind === "vendor" ? VENDOR_COOKIE : COOKIE);
}

// --- the current user -------------------------------------------------------

export interface SessionUser {
  id: string;
  employeeId: string;
  fullName: string;
  email: string;
  designation: string;
  userType: string;
  departmentId: string | null;
  departmentName: string | null;
  branchId: string | null;
  branchName: string | null;
  roleIds: string[];
  roleNames: string[];
  /** Primary role name, used for audit rows and the top bar. */
  roleName: string;
  permissions: Set<string>; // "MODULE:ACTION"
  vendorId: string | null;
  vendorName: string | null;
}

async function loadUser(userId: string): Promise<SessionUser | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      department: true,
      branch: true,
      vendorUser: { include: { vendor: true } },
      roles: {
        orderBy: { sequence: "asc" },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });
  if (!u || !u.isActive) return null;

  const permissions = new Set<string>();
  for (const ur of u.roles) {
    for (const rp of ur.role.permissions) {
      permissions.add(`${rp.permission.module}:${rp.permission.action}`);
    }
  }

  // Already ordered by sequence: the first is the capacity this user acts in.
  const roles = u.roles.map(r => r.role);

  return {
    id: u.id,
    employeeId: u.employeeId,
    fullName: u.fullName,
    email: u.email,
    designation: u.designation,
    userType: u.userType,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    branchId: u.branchId,
    branchName: u.branch?.name ?? null,
    roleIds: roles.map(r => r.id),
    roleNames: roles.map(r => r.name),
    roleName: roles[0]?.name ?? "No role",
    permissions,
    vendorId: u.vendorUser?.vendorId ?? null,
    vendorName: u.vendorUser?.vendor.companyName ?? null,
  };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = decode(jar.get(COOKIE)?.value);
  if (!id) return null;
  return loadUser(id);
}

export async function currentVendorUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const id = decode(jar.get(VENDOR_COOKIE)?.value);
  if (!id) return null;
  const u = await loadUser(id);
  return u?.userType === "VENDOR" ? u : null;
}

/** For server components that must have a user. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function requireVendorUser(): Promise<SessionUser> {
  const u = await currentVendorUser();
  if (!u) throw new Error("UNAUTHENTICATED_VENDOR");
  return u;
}

// --- authentication ---------------------------------------------------------

export async function authenticate(email: string, password: string, kind: "internal" | "vendor") {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.isActive) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  if (kind === "vendor" && user.userType !== "VENDOR") return null;
  if (kind === "internal" && user.userType !== "INTERNAL") return null;
  return user;
}

// --- authorisation ----------------------------------------------------------

/**
 * Permission check. Server side, always.
 *
 * Hiding a button in the interface is not access control. Every mutation calls
 * `assertCan` before it does any work, and the sidebar filters on the same
 * data so what a user can see and what they can do never diverge.
 */
export function can(user: SessionUser | null, module: string, action: PermissionAction | string): boolean {
  if (!user) return false;
  return user.permissions.has(`${module}:${action}`);
}

export function assertCan(user: SessionUser | null, module: string, action: PermissionAction | string): void {
  if (!can(user, module, action)) {
    throw new PermissionDenied(module, String(action), user?.roleNames.join(", ") ?? "none");
  }
}

/** Actor shape used by the audit and workflow helpers. */
export function actorOf(user: SessionUser) {
  return { id: user.id, fullName: user.fullName, roleName: user.roleName, roleIds: user.roleIds };
}
