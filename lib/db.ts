// lib/db.ts
// Prisma-klient som singleton.
//
// RÄTTAT: loggade "query" i utvecklingsläge, vilket skrev ut varje SQL-fråga
// i terminalen. Det dränkte de riktiga felmeddelandena — du fick scrolla
// förbi hundratals rader prisma:query för att hitta det som gått fel.
//
// Nu loggas bara varningar och fel.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
