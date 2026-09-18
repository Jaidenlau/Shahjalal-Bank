import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client across hot reloads in development. SQLite tolerates
 * exactly one writer, so a second client would surface as intermittent
 * "database is locked" errors mid-demo.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.VERTEX_SQL_LOG ? ["query", "warn", "error"] : ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Transaction client type, for helpers that must run inside an open transaction. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
