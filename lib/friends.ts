// lib/friends.ts
// Vänskap ligger som EN rad, inte två. Vem som skickade förfrågan är
// bevarat, vilket krävs för att veta vem som ska svara — men det betyder
// att varje uppslag måste göras åt båda hållen.

import { prisma } from "./db";
import { wornBorders } from "./repertoire";

export type FriendState =
  | "none"
  | "pending-sent"
  | "pending-received"
  | "friends"
  | "self";

export interface FriendCard {
  id:         string;
  handle:     string | null;
  username:   string;
  avatarUrl:  string | null;
  xp:         number;
  rank:       string;
  streakDays: number;
  medals:     number;
  works:      number;
  /** Id på själva vänskapsraden — behövs för att svara eller ta bort. */
  friendshipId: string;
  since:        Date | null;
  /** Gruppbarden de bar, eller null. Avgjort pa servern. */
  border:       string | null;
}

/** Relationen mellan två användare, sedd från den förstas håll. */
export async function friendState(
  viewerId: string,
  otherId:  string
): Promise<{ state: FriendState; friendshipId: string | null }> {
  if (viewerId === otherId) return { state: "self", friendshipId: null };

  const row = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId,  addresseeId: viewerId },
      ],
    },
    select: { id: true, status: true, requesterId: true },
  });

  if (!row) return { state: "none", friendshipId: null };

  if (row.status === "accepted") {
    return { state: "friends", friendshipId: row.id };
  }

  return {
    state: row.requesterId === viewerId ? "pending-sent" : "pending-received",
    friendshipId: row.id,
  };
}

/** Alla id:n som är vänner med användaren. */
export async function friendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });

  return rows.map(r => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

/** Vänner med den statistik som visas i listan. */
export async function listFriends(userId: string): Promise<FriendCard[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: {
      id: true, requesterId: true, respondedAt: true,
      requester: { select: profileSelect },
      addressee: { select: profileSelect },
    },
  });

  const others  = rows.map(r => (r.requesterId === userId ? r.addressee : r.requester));
  // En fraga for alla bardar, inte en per rad.
  const borders = await wornBorders(others.map(o => o.id));

  return rows.map(r => {
    const other = r.requesterId === userId ? r.addressee : r.requester;
    return toCard(other, r.id, r.respondedAt, borders.get(other.id) ?? null);
  });
}

/** Inkommande förfrågningar som väntar på svar. */
export async function incomingRequests(userId: string): Promise<FriendCard[]> {
  const rows = await prisma.friendship.findMany({
    where:   { addresseeId: userId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, createdAt: true,
      requester: { select: profileSelect },
    },
  });

  const borders = await wornBorders(rows.map(r => r.requester.id));
  return rows.map(r => toCard(r.requester, r.id, null, borders.get(r.requester.id) ?? null));
}

/** Egna förfrågningar som ännu inte besvarats. */
export async function outgoingRequests(userId: string): Promise<FriendCard[]> {
  const rows = await prisma.friendship.findMany({
    where:   { requesterId: userId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, createdAt: true,
      addressee: { select: profileSelect },
    },
  });

  const borders = await wornBorders(rows.map(r => r.addressee.id));
  return rows.map(r => toCard(r.addressee, r.id, null, borders.get(r.addressee.id) ?? null));
}

const profileSelect = {
  id: true, handle: true, username: true, avatarUrl: true,
  xp: true, rank: true, streakDays: true,
  _count: { select: { medals: true, works: true } },
} as const;

type ProfileRow = {
  id: string; handle: string | null; username: string;
  avatarUrl: string | null; xp: number; rank: string; streakDays: number;
  _count: { medals: number; works: number };
};

function toCard(
  u: ProfileRow,
  friendshipId: string,
  since: Date | null,
  border: string | null = null
): FriendCard {
  return {
    id:         u.id,
    border,
    handle:     u.handle,
    username:   u.username,
    avatarUrl:  u.avatarUrl,
    xp:         u.xp,
    rank:       u.rank,
    streakDays: u.streakDays,
    medals:     u._count.medals,
    works:      u._count.works,
    friendshipId,
    since,
  };
}

// ── Handle ────────────────────────────────────────────────────────────

const RESERVED = new Set([
  "admin", "api", "app", "rhapsode", "support", "help", "about",
  "settings", "profile", "library", "today", "progress", "friends",
  "sign-in", "sign-up", "new", "edit", "delete", "null", "undefined",
]);

export function validateHandle(input: string): {
  ok: boolean; handle: string; lower: string; error?: string;
} {
  // RATTAT: handtaget tvingades till gemener, sa "Casper" blev "casper"
  // och det gick inte att skriva sitt namn som man stavar det.
  //
  // Versaler bevaras nu i `handle`, som ar det som VISAS. Unikheten och
  // alla uppslagningar gar mot `lower`. Det ar den delningen som gor att
  // versaler kan tillatas utan att "Casper" och "casper" blir tva konton
  // — vilket vore ett satt att utge sig for att vara nagon annan.
  const handle = input.trim().replace(/^@/, "");
  const lower  = handle.toLowerCase();

  if (handle.length < 3)  return { ok: false, handle, lower, error: "At least 3 characters." };
  if (handle.length > 20) return { ok: false, handle, lower, error: "At most 20 characters." };
  if (!/^[A-Za-z0-9_]+$/.test(handle)) {
    return { ok: false, handle, lower, error: "Letters, numbers and underscores only." };
  }
  if (/^\d+$/.test(handle)) {
    return { ok: false, handle, lower, error: "Can't be only numbers." };
  }
  if (RESERVED.has(lower)) {
    return { ok: false, handle, lower, error: "That one is taken by the app itself." };
  }

  return { ok: true, handle, lower };
}


// ── Uppslagning ───────────────────────────────────────────────────────

/**
 * Anvandar-id:t bakom ett handtag, eller null.
 *
 * RATTAT: att klicka pa en van gav "Nothing here".
 *
 * Unikheten flyttades till `handleLower` i samma andring som infarde
 * versaler i visningsformen. Kolumnen las dock aldrig tillbaka i de rader
 * som redan fanns — de hade `handle` satt och `handleLower` tom. Varje
 * uppslagning gick mot den tomma kolumnen, sa /u/<handle> hittade ingen
 * och `notFound()` slog till. Samma sak gjorde att en vanforfragan till
 * ett befintligt handtag svarade "No one goes by @...".
 *
 * Har ligger darfor bade det normala fallet och reservvagen: hittas
 * ingenting pa `handleLower` provas `handle` utan hansyn till versaler,
 * och traffas nagon skrivs kolumnen samtidigt i ordning. Raden lakes en
 * gang och gar sedan den snabba vagen for all framtid.
 *
 * scripts/backfill-handles.mjs gor samma sak for hela tabellen pa en
 * gang. Reservvagen finns anda kvar — den kostar ingenting nar kolumnen
 * ar ifylld, och den ar det som gor att ett glomt skript inte ater tar
 * ned funktionen.
 */
export async function resolveHandle(input: string): Promise<string | null> {
  const lower = String(input ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!lower) return null;

  const exact = await prisma.user.findUnique({
    where:  { handleLower: lower },
    select: { id: true },
  });
  if (exact) return exact.id;

  const legacy = await prisma.user.findFirst({
    where:  { handleLower: null, handle: { equals: lower, mode: "insensitive" } },
    select: { id: true, handle: true },
  });
  if (!legacy?.handle) return null;

  // Lak raden. Misslyckas det — nagon annan hann ta gemenformen — ar
  // traffen anda giltig, sa uppslagningen far inte falla pa skrivningen.
  await prisma.user
    .update({
      where: { id: legacy.id },
      data:  { handleLower: legacy.handle.toLowerCase() },
    })
    .catch(() => {});

  return legacy.id;
}
