#!/usr/bin/env node
// scripts/access-code.mjs
//
// Ge bort Pro. Från kommandoraden, aldrig från appen.
//
// Det finns med flit ingen HTTP-väg som SKAPAR en kod. Webbläsaren kan
// bara lösa in en. Skulle någon hitta ett hål i inlösenroutens
// behörighetskontroll får de i värsta fall lösa in en kod de redan har —
// de kan inte tillverka nya.
//
// Kör med:
//
//   node --env-file=.env scripts/access-code.mjs <kommando>
//
// Kommandon:
//
//   whoami                     Lista användare med id — det du klistrar in
//                              i RHAPSODE_DEVELOPER_USER_IDS.
//
//   new [flaggor]              Skapa en kod.
//       --dev                  Utvecklarkod: Pro på livstid + DEV-markör
//       --uses <n>             Antal inlösen (standard 1)
//       --days <n>             Hur länge Pro gäller efter inlösen
//                              (utelämnas = tills vidare)
//       --expires <n>          Hur många dagar koden går att lösa in
//       --note "text"          Anteckning till dig själv
//       --prefix RHAP          Kodprefix
//
//   list                       Visa alla koder och hur de använts.
//
//   revoke <kod>               Stäng koden och dra tillbaka det den gav.
//
//   grant <userId> [--days n]  Ge Pro direkt, utan kod.
//
// Exempel:
//
//   node --env-file=.env scripts/access-code.mjs new --uses 25 --days 365 \
//        --note "Teaterhögskolan, hösten"

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

// Måste stämma med normaliseCode() i lib/billing/access.ts:
// versaler, siffror och bindestreck. Utan 0/O och 1/I/L — koderna läses
// upp i telefon och skrivs av för hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(prefix = "RHAP") {
  const bytes = randomBytes(12);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]);
  const groups = [0, 1, 2].map(i => chars.slice(i * 4, i * 4 + 4).join(""));
  return `${prefix}-${groups.join("-")}`;
}

function flag(args, name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1];
}

function int(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function whoami() {
  const users = await prisma.user.findMany({
    select: { id: true, clerkId: true, username: true, handle: true, plan: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n${users.length} user(s):\n`);
  for (const u of users) {
    console.log(`  ${u.id}`);
    console.log(`    ${u.username}${u.handle ? ` (@${u.handle})` : ""} · ${u.plan} · joined ${u.createdAt.toISOString().slice(0, 10)}`);
    console.log(`    clerk: ${u.clerkId}\n`);
  }
  console.log("Put your own id in .env to hold Pro permanently, outside the database:\n");
  console.log(`  RHAPSODE_DEVELOPER_USER_IDS=${users[0]?.id ?? "<your-id>"}\n`);
}

async function create(args) {
  // --dev ger en kod som gor kontot till ett utvecklarkonto: Pro pa
  // livstid, och DEV-markoren uppe till hoger. Losas in under
  // Settings -> Subscription som vilken annan kod som helst.
  const dev = args.includes("--dev");
  const plan = dev ? "developer" : "pro";

  const code = await prisma.accessCode.create({
    data: {
      code:           generateCode(flag(args, "prefix", dev ? "RHAP-DEV" : "RHAP")),
      plan,
      maxRedemptions: int(flag(args, "uses"), 1),
      durationDays:   dev ? null : (flag(args, "days") ? int(flag(args, "days"), null) : null),
      note:           flag(args, "note", null),
      expiresAt: flag(args, "expires")
        ? new Date(Date.now() + int(flag(args, "expires"), 30) * 86_400_000)
        : null,
    },
  });

  console.log(`\n  ${code.code}\n`);
  console.log(`  ${code.plan === "developer" ? "DEVELOPER — Pro for life, DEV marker shown" : "Pro"} · ${code.maxRedemptions} redemption(s) · ${
    code.durationDays ? `${code.durationDays} days once claimed` : "no end date"
  }`);
  if (code.expiresAt) console.log(`  Claimable until ${code.expiresAt.toISOString().slice(0, 10)}`);
  if (code.note)      console.log(`  Note: ${code.note}`);
  console.log(`\n  Redeemed at /settings/subscription\n`);
}

async function list() {
  const codes = await prisma.accessCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { grants: true } } },
  });

  if (!codes.length) return console.log("\nNo codes yet.\n");

  console.log(`\n${codes.length} code(s):\n`);
  for (const c of codes) {
    const state = !c.active ? "revoked"
      : c.expiresAt && c.expiresAt < new Date() ? "expired"
      : c.redemptions >= c.maxRedemptions ? "fully claimed"
      : "open";
    console.log(`  ${c.code}  ${c.redemptions}/${c.maxRedemptions}  ${state}`);
    if (c.note) console.log(`      ${c.note}`);
  }
  console.log();
}

async function revoke(code) {
  if (!code) return console.error("Usage: revoke <code>");

  const record = await prisma.accessCode.findUnique({
    where: { code: code.toUpperCase() },
    select: { id: true, code: true },
  });
  if (!record) return console.error(`No such code: ${code}`);

  await prisma.accessCode.update({ where: { id: record.id }, data: { active: false } });

  const grants = await prisma.accessGrant.findMany({
    where: { codeId: record.id, revokedAt: null },
    select: { userId: true },
  });
  await prisma.accessGrant.updateMany({
    where: { codeId: record.id, revokedAt: null },
    data:  { revokedAt: new Date() },
  });

  // Bara de som fick Pro genom just den här koden faller tillbaka. Någon
  // som hunnit teckna en riktig prenumeration rörs inte.
  if (grants.length) {
    await prisma.user.updateMany({
      where: { id: { in: grants.map(g => g.userId) }, planSource: "grant" },
      data:  { plan: "free", planSource: "none", subscriptionStatus: "free", currentPeriodEnd: null },
    });
  }

  console.log(`\n  ${record.code} revoked · ${grants.length} grant(s) withdrawn\n`);
}

async function grant(userId, args) {
  if (!userId) return console.error("Usage: grant <userId> [--days n]");

  const user = await prisma.user.findUnique({
    where: { id: userId }, select: { id: true, username: true },
  });
  if (!user) return console.error(`No such user: ${userId}`);

  const days = flag(args, "days") ? int(flag(args, "days"), null) : null;
  const expiresAt = days ? new Date(Date.now() + days * 86_400_000) : null;

  await prisma.accessGrant.create({
    data: {
      userId: user.id, plan: "pro", source: "manual",
      note: flag(args, "note", "granted from the command line"), expiresAt,
    },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: "pro", planSource: "grant",
      subscriptionStatus: "active", currentPeriodEnd: expiresAt,
    },
  });

  console.log(`\n  ${user.username} now has Pro${days ? ` for ${days} days` : ", with no end date"}.\n`);
}

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case "whoami": await whoami();               break;
    case "new":    await create(args);           break;
    case "list":   await list();                 break;
    case "revoke": await revoke(args[0]);        break;
    case "grant":  await grant(args[0], args);   break;
    default:
      console.log(
        "\nUsage: node --env-file=.env scripts/access-code.mjs <command>\n\n" +
        "  whoami                     list users and their ids\n" +
        "  new [--dev] [--uses n] [--days n] [--expires n] [--note \"…\"]\n" +
        "  list                       show every code\n" +
        "  revoke <code>              close a code and withdraw it\n" +
        "  grant <userId> [--days n]  give Pro directly\n"
      );
  }
} finally {
  await prisma.$disconnect();
}
