// lib/friends.ts
// Vänskap ligger som EN rad, inte två. Vem som skickade förfrågan är
// bevarat, vilket krävs för att veta vem som ska svara — men det betyder
// att varje uppslag måste göras åt båda hållen.

import { prisma } from "./db";

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

  return rows.map(r => {
    const other = r.requesterId === userId ? r.addressee : r.requester;
    return toCard(other, r.id, r.respondedAt);
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

  return rows.map(r => toCard(r.requester, r.id, null));
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

  return rows.map(r => toCard(r.addressee, r.id, null));
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

function toCard(u: ProfileRow, friendshipId: string, since: Date | null): FriendCard {
  return {
    id:         u.id,
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
  ok: boolean; handle: string; error?: string;
} {
  const handle = input.trim().toLowerCase().replace(/^@/, "");

  if (handle.length < 3)  return { ok: false, handle, error: "At least 3 characters." };
  if (handle.length > 20) return { ok: false, handle, error: "At most 20 characters." };
  if (!/^[a-z0-9_]+$/.test(handle)) {
    return { ok: false, handle, error: "Letters, numbers and underscores only." };
  }
  if (/^\d+$/.test(handle)) {
    return { ok: false, handle, error: "Can't be only numbers." };
  }
  if (RESERVED.has(handle)) {
    return { ok: false, handle, error: "That one is taken by the app itself." };
  }

  return { ok: true, handle };
}
