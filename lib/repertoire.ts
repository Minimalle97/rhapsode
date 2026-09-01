// lib/repertoire.ts
//
// Repertoaren: 762 dikter i 24 grupper, med lankar till arkiven som for
// texterna.
//
// ── Vad som INTE finns har ────────────────────────────────────────────
//
// Ingen dikttext. Repertoaren ar en lista och en vagvisare, aldrig ett
// bibliotek: den namner titel och upphovsperson och pekar pa arkivet.
// Anvandaren hamtar texten dar och klistrar in den, precis som med vilket
// annat verk som helst. Se lib/repertoire/data.ts for skalet.
//
// ── Vad som raknas som avklarat ───────────────────────────────────────
//
// Verksmedaljen — alla sektioner bemastrade enligt SM-2, det appen kallar
// "a work held entire". Inte framforandetiteln: den kraver tio rena
// genomforanden per verk, och en grupp pa sjuttio dikter hade da krävt
// sjuhundra. En grupp ska ga att ta.
//
// ── Hur ett verk kopplas till en dikt i listan ────────────────────────
//
// Tva vagar, och stampeln vinner over gissningen:
//
//   canonicalId — satt nar verket lades till fran repertoaren. Exakt.
//   titel+namn  — for verk som redan lag i biblioteket. Normaliserat.
//
// Igenkanningen ar med flit strikt. Titeln maste stamma ord for ord efter
// normalisering; bara upphovspersonen far vara slapp, sa att "Wordsworth"
// och "William Wordsworth" ar samma. Losare an sa borjar den kreditera
// fel dikt, och en grupp som blir klar av misstag ar samre an en som inte
// blir klar alls.

import { prisma } from "./db";
import { GROUPS, ALL_ENTRIES, TOTAL_ENTRIES, type RepertoireEntry, type RepertoireGroup } from "./repertoire/data";
import { ARCHIVES, archiveUrl, type ArchiveCode } from "./repertoire/archives";
import type { Entitlements } from "./billing/entitlements";

export { GROUPS, ALL_ENTRIES, TOTAL_ENTRIES, ARCHIVES, archiveUrl };
export type { RepertoireEntry, RepertoireGroup, ArchiveCode };

export function groupById(id: string): RepertoireGroup | undefined {
  return GROUPS.find(g => g.id === id);
}

export function entryById(id: number): RepertoireEntry | undefined {
  return ALL_ENTRIES.find(e => e.id === id);
}

// ── Igenkanning ───────────────────────────────────────────────────────

/**
 * Normalform for jamforelse.
 *
 * Diakriter bort, skiljetecken bort, gemener, ett mellanslag mellan ord.
 * "Rubáiyát" och "Rubaiyat" ar samma dikt, och den som skrev in den for
 * hand ska inte straffas for att de hoppade over accenterna.
 */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Efternamnet, for den slappare halvan av jamforelsen. */
function surname(author: string): string {
  const parts = normalise(author).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/** Titel → alla listposter med den titeln. Byggs en gang. */
const BY_TITLE = new Map<string, RepertoireEntry[]>();
for (const entry of ALL_ENTRIES) {
  const key = normalise(entry.title);
  const list = BY_TITLE.get(key);
  if (list) list.push(entry);
  else BY_TITLE.set(key, [entry]);
}

/**
 * Vilken dikt i listan ett verk ar, eller null.
 *
 * Stampeln forst — den ar ett val nagon gjort. Sedan titel plus namn.
 *
 * Star tva dikter under samma titel (det finns flera: "Song", "Sonnet")
 * avgor upphovspersonen. Gar det anda inte att skilja dem at lamnas det
 * okant hellre an gissat.
 */
export function matchEntry(work: {
  canonicalId: number | null;
  title:  string;
  author: string;
}): RepertoireEntry | null {
  if (work.canonicalId !== null) {
    return entryById(work.canonicalId) ?? null;
  }

  const candidates = BY_TITLE.get(normalise(work.title));
  if (!candidates?.length) return null;
  if (candidates.length === 1) {
    return sameAuthor(candidates[0].author, work.author) ? candidates[0] : null;
  }

  const byAuthor = candidates.filter(c => sameAuthor(c.author, work.author));
  return byAuthor.length === 1 ? byAuthor[0] : null;
}

/** Sant for "Anonymous", "Anonymous (Akkadian)", "Unknown", "Anon." */
function isAnonymous(author: string): boolean {
  const first = normalise(author).split(" ")[0] ?? "";
  return first === "anonymous" || first === "anon" || first === "unknown";
}

function sameAuthor(listed: string, mine: string): boolean {
  const a = normalise(listed);
  const b = normalise(mine);
  if (a === b) return true;

  // Bada anonyma: titeln far avgora ensam.
  //
  // Listan skriver ut spraket — "Anonymous (Akkadian)", "Anonymous
  // (Latin)" — medan den som lade in verket for hand nastan alltid bara
  // skrev "Anonymous". Utan det har fallet fick de aldrig tillgodo en
  // enda ballad, och gruppen med anonym vers gick inte att ta.
  //
  // Det ar inte losare an resten: titeln maste fortfarande stamma ord
  // for ord, och det ar den som bar jamforelsen. "Anonymous" blir alltsa
  // inte en universalnyckel — det slutar vara ett sarskiljande falt for
  // texter som anda inte har nagon upphovsperson att sarskilja pa.
  if (isAnonymous(listed) && isAnonymous(mine)) return true;

  // Ett riktigt namn mot ett anonymt ar inte samma dikt.
  if (isAnonymous(listed) || isAnonymous(mine)) return false;

  const surnameA = surname(listed);
  if (!surnameA) return a === b;

  return surname(mine) === surnameA;
}

// ── Framsteg ──────────────────────────────────────────────────────────

export interface EntryState {
  /** Verket finns i biblioteket. */
  workId:   string | null;
  /** Verksmedaljen ar utdelad — dikten sitter. Ger den grona markeringen. */
  held:     boolean;
}

export interface GroupProgress {
  group:    RepertoireGroup;
  /** Antal dikter i gruppen som sitter. */
  held:     number;
  /** Antal som finns i biblioteket, hallna eller ej. */
  started:  number;
  total:    number;
  percent:  number;
  complete: boolean;
}

/**
 * Vad anvandaren gjort av hela repertoaren.
 *
 * EN fraga for allt. Biblioteket kan innehalla hundra verk och listan ar
 * 762 poster lang; att sla upp dem post for post vore 762 fragor for en
 * sida som bara ska visa 24 staplar.
 */
export async function repertoireState(userId: string): Promise<Map<number, EntryState>> {
  const works = await prisma.work.findMany({
    where:  { userId },
    select: {
      id: true, title: true, author: true, canonicalId: true,
      // Verksmedaljen ar beviset. `kind: "work"` med flit — en battle-
      // eller framforandemedalj sager nagot annat.
      medals: { where: { kind: "work" }, select: { id: true }, take: 1 },
    },
  });

  const state = new Map<number, EntryState>();

  for (const work of works) {
    const entry = matchEntry(work);
    if (!entry) continue;

    const held = work.medals.length > 0;
    const prev = state.get(entry.id);

    // Samma dikt kan ligga tva ganger i biblioteket. Den som sitter
    // vinner, annars den forsta.
    if (!prev || (held && !prev.held)) {
      state.set(entry.id, { workId: work.id, held });
    }
  }

  return state;
}

/** Staplarna for oversiktssidan. */
export function progressFor(state: Map<number, EntryState>): GroupProgress[] {
  return GROUPS.map(group => {
    let held = 0, started = 0;
    for (const entry of group.entries) {
      const s = state.get(entry.id);
      if (!s) continue;
      started += 1;
      if (s.held) held += 1;
    }
    const total = group.entries.length;
    return {
      group, held, started, total,
      percent:  total > 0 ? Math.round((held / total) * 100) : 0,
      complete: total > 0 && held === total,
    };
  });
}

// ── Utmarkelsen ───────────────────────────────────────────────────────

export interface AwardRow {
  groupId:    string;
  earnedAt:   Date;
  unlockedAt: Date | null;
}

export async function awardsFor(userId: string): Promise<Map<string, AwardRow>> {
  const rows = await prisma.groupAward.findMany({
    where:  { userId },
    select: { groupId: true, earnedAt: true, unlockedAt: true },
  });
  return new Map(rows.map(r => [r.groupId, r]));
}

/**
 * Delar ut utmarkelser for grupper som blivit klara.
 *
 * Kors lat, nar nagon tittar — appen har ingen schemalaggare, och en
 * utmarkelse som ingen sett annu har inte gjort nagon skada. Samma
 * monster som mastartitlarna i performanceStore.
 *
 * Kraver INGEN plan. Att ta hela Shakespeare ar en bedrift oavsett vad
 * man betalar; det ar att BARA barden som ar Pro. Skulle den har
 * funktionen fraga efter planen vore bedriften borta for den som senare
 * uppgraderar, och da vore uppgraderingen ett straff.
 *
 * `createMany` med skipDuplicates gor utdelningen idempotent mot den
 * unika nyckeln [userId, groupId] — tva samtidiga sidladdningar kan na
 * hit, och bara den ena far skriva.
 */
export async function syncGroupAwards(
  userId: string,
  progress: GroupProgress[]
): Promise<string[]> {
  const complete = progress.filter(p => p.complete).map(p => p.group.id);
  if (complete.length === 0) return [];

  const existing = await prisma.groupAward.findMany({
    where:  { userId, groupId: { in: complete } },
    select: { groupId: true },
  });
  const have = new Set(existing.map(e => e.groupId));
  const fresh = complete.filter(id => !have.has(id));
  if (fresh.length === 0) return [];

  await prisma.groupAward.createMany({
    data: fresh.map(groupId => ({ userId, groupId })),
    skipDuplicates: true,
  });

  return fresh;
}

// ── Bardarna ──────────────────────────────────────────────────────────

export class RepertoireError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "RepertoireError";
    this.status = status;
  }
}

/**
 * Oppnar lasset och tar barden i bruk.
 *
 * HAR sitter Pro-kravet, och bara har. Utdelningen ovan ar fri.
 *
 * Kontrollen gors mot databasen och inte mot det granssnittet skickar:
 * utmarkelsen maste finnas, och den maste vara denna anvandares. Utan den
 * kontrollen rackte det att kanna en grupps slug for att bara dess bard.
 */
export async function unlockBorder(
  userId: string,
  groupId: string,
  ent: Entitlements
): Promise<void> {
  if (!groupById(groupId)) throw new RepertoireError("No such group.", 404);
  if (!ent.isPro) throw new RepertoireError("upgrade_required", 402);

  const award = await prisma.groupAward.findUnique({
    where:  { userId_groupId: { userId, groupId } },
    select: { id: true, unlockedAt: true },
  });
  if (!award) {
    throw new RepertoireError("Finish the group first.", 409);
  }
  if (award.unlockedAt) return;   // redan upplast; inget att gora

  await prisma.groupAward.update({
    where: { id: award.id },
    data:  { unlockedAt: new Date() },
  });
}

/**
 * Byter bard, eller tar av den.
 *
 * Bara upplasta bardar gar att bara. `null` tar av den och ar tillaten
 * for alla — den som tappar Pro ska kunna stalla tillbaka sin bild aven
 * om de inte langre far valja en ny.
 */
export async function equipBorder(
  userId: string,
  groupId: string | null,
  ent: Entitlements
): Promise<void> {
  if (groupId === null) {
    await prisma.user.update({ where: { id: userId }, data: { profileBorder: null } });
    return;
  }

  if (!groupById(groupId)) throw new RepertoireError("No such border.", 404);
  if (!ent.isPro) throw new RepertoireError("upgrade_required", 402);

  const award = await prisma.groupAward.findUnique({
    where:  { userId_groupId: { userId, groupId } },
    select: { unlockedAt: true },
  });
  if (!award?.unlockedAt) {
    throw new RepertoireError("That border is still locked.", 409);
  }

  await prisma.user.update({
    where: { id: userId },
    data:  { profileBorder: groupId },
  });
}

/**
 * Barden en person visar just nu, eller null.
 *
 * Tva villkor, bada nodvandiga: den maste vara upplast, och baraven maste
 * fortfarande ha Pro. Slutar nagon betala slocknar barden runt bilden men
 * raden i GroupAward star kvar — bedriften ar deras, visningen ar
 * abonnemanget. Borjar de betala igen ar barden tillbaka utan att nagot
 * behover goras om.
 */
export async function wornBorder(
  userId: string,
  isPro: boolean
): Promise<string | null> {
  if (!isPro) return null;

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { profileBorder: true },
  });
  if (!user?.profileBorder) return null;

  const award = await prisma.groupAward.findUnique({
    where:  { userId_groupId: { userId, groupId: user.profileBorder } },
    select: { unlockedAt: true },
  });
  return award?.unlockedAt ? user.profileBorder : null;
}

/** Bardarna for manga personer pa en gang — vanlistan, floden. */
export async function wornBorders(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;

  const users = await prisma.user.findMany({
    where:  { id: { in: userIds }, profileBorder: { not: null } },
    select: {
      id: true, profileBorder: true, plan: true, planSource: true,
      subscriptionStatus: true, currentPeriodEnd: true,
      groupAwards: { where: { unlockedAt: { not: null } }, select: { groupId: true } },
    },
  });

  for (const u of users) {
    if (!u.profileBorder) continue;
    // Grov plankontroll: raden sager pro, eller en period som annu loper.
    // Full harledning kraver getEntitlements per person, vilket vore en
    // fraga var; for en avatar i en lista racker raden.
    const paying =
      u.plan === "pro" ||
      (u.currentPeriodEnd !== null && u.currentPeriodEnd.getTime() > Date.now());
    if (!paying) continue;

    if (u.groupAwards.some(a => a.groupId === u.profileBorder)) {
      out.set(u.id, u.profileBorder);
    }
  }

  return out;
}
