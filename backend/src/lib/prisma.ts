import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in dev (tsx watch) to avoid
// exhausting the database connection pool with a new client on every reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
