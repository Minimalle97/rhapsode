// lib/duels.ts
//
// Tvekamp: tva personer, en text, en klocka.
//
// Hela regelverket ligger har, och bara har. Routerna under
// app/api/duels/ gor ingenting annat an att slappa in ett anrop och
// oversatta ett fel — precis som resten av kodbasen halls beslutet om
// VAD som far ske skilt fran hur det kom in.
//
// ── Vad som mats ──────────────────────────────────────────────────────
//
// "Den som memorerat mest" raknas som ORD SOM HALLS, vilket ar samma
// matt appen redan visar efter varje forsok ("32 of 40 words held").
// For varje sektion tas det basta rattade forsoket inom tidsfonstret,
// och de summeras.
//
// Det ar avsiktligt inte SM-2-status. En tio minuters tvekamp hinner
// aldrig flytta en sektion till "mastered" — intervallet kraver veckor —
// sa ett matt byggt pa status hade gett 0–0 i varje kort kamp. Det som
// mats ar vad man faktiskt kunde aterge, nar man provades.
//
// Rattningen ar densamma som overallt annars: lib/cue.ts, Levenshtein pa
// ordniva, ingen modell inblandad. En vinnare som en sprakmodell utsett
// hade varken gatt att reproducera eller att lita pa.
//
// ── Vem som far bjuda in ──────────────────────────────────────────────
//
// Bara Pro. Kontrollen sitter i `createDuel` och ingen annanstans, sa
// att den inte kan kringgas genom att anropa API:et for hand.
//
// Den INBJUDNE behover inte Pro. Under kampen far bada samma verktyg pa
// just det verket — se `duelEntitlements`. En tvekamp dar den ena sidan
// har battre redskap ar ingen tvekamp.

import { prisma } from "./db";
import { entitlementsForPlan, type Entitlements } from "./billing/entitlements";
import { friendState } from "./friends";
import { recordMilestone } from "./posts";

// ── Langderna ─────────────────────────────────────────────────────────

export interface DuelDuration {
  minutes: number;
  /** Vad knappen sager. */
  label:   string;
  /** En rad om vad man realistiskt hinner. Star under valjaren. */
  hint:    string;
}

export const DURATIONS: readonly DuelDuration[] = [
  { minutes: 10,     label: "10 minutes", hint: "A sprint. One passage, held or not." },
  { minutes: 60,     label: "1 hour",     hint: "Long enough to get a short poem down." },
  { minutes: 180,    label: "3 hours",    hint: "An afternoon. Several sections." },
  { minutes: 1_440,  label: "1 day",      hint: "A day and a night to hold as much as you can." },
  { minutes: 10_080, label: "7 days",     hint: "A week. This is where long works are won." },
] as const;

export function isValidDuration(minutes: unknown): minutes is number {
  return DURATIONS.some(d => d.minutes === minutes);
}

export function durationLabel(minutes: number): string {
  return DURATIONS.find(d => d.minutes === minutes)?.label ?? `${minutes} minutes`;
}

export type DuelStatus = "pending" | "active" | "finished" | "declined" | "cancelled";

/** Kamper som annu inte ar avgjorda. Det ar de som far rita ut sig. */
const LIVE: DuelStatus[] = ["pending", "active"];

// ── Fel ───────────────────────────────────────────────────────────────
//
// Egna klasser sa att guard.ts kan oversatta dem till ratt statuskod
// utan att routen behover kanna till nagot av det har.

export class DuelError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DuelError";
    this.status = status;
  }
}

// ── Matningen ─────────────────────────────────────────────────────────

export interface DuelSide {
  userId:    string;
  username:  string;
  handle:    string | null;
  avatarUrl: string | null;
  /** Summan av basta rattade forsok per sektion. Det som avgor. */
  wordsHeld:     number;
  /** Hur manga ord verket bestar av. Samma for bada — samma text. */
  wordsPossible: number;
  /** Sektioner dar minst ett rattat forsok gjorts. */
  sectionsAttempted: number;
  /** Sektioner dar 90 % eller mer av orden satt. */
  sectionsHeld:      number;
  /** Medelvarde over alla rattade forsok, 0-100. Forsta skiljetecknet. */
  accuracy:  number;
  /** Sekunder ovade i fonstret. Andra skiljetecknet. */
  seconds:   number;
  /** Antal rattade forsok. Visas, avgor inget. */
  attempts:  number;
  /** XP tjanat i fonstret. Visas, avgor inget. */
  xp:        number;
}

export interface DuelResult {
  challenger: DuelSide;
  opponent:   DuelSide;
  /** null = oavgjort. */
  winnerId:   string | null;
  /** Vad som skilde dem at. For en rad text i resultatet. */
  margin:     "words" | "accuracy" | "time" | "draw";
}

/** Sektioner dar 90 % av orden satt raknas som hallna. */
const HELD_THRESHOLD = 0.9;

/** Lagen dar texten INTE ligger framme. Bara de bevisar nagot. */
const TESTED_MODES = ["write", "recite"];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Hur mycket en person holl av sitt verk inom ett tidsfonster.
 *
 * Basta forsok per sektion, inte senaste och inte summan. Skalet: den som
 * kan en strof ska inte kunna oka sin siffra genom att skriva av den tio
 * ganger, och den som just testat en svarare vinkel ska inte straffas for
 * att det gick samre an gangen innan. Basta forsoket ar det narmaste ett
 * svar pa "hur mycket av det har kan du".
 */
export async function measureSide(
  workId: string | null,
  from:   Date,
  to:     Date
): Promise<Omit<DuelSide, "userId" | "username" | "handle" | "avatarUrl">> {
  const empty = {
    wordsHeld: 0, wordsPossible: 0, sectionsAttempted: 0,
    sectionsHeld: 0, accuracy: 0, seconds: 0, attempts: 0, xp: 0,
  };
  if (!workId) return empty;

  const sections = await prisma.section.findMany({
    where:  { workId },
    select: {
      id: true, content: true,
      practiceSessions: {
        where: {
          createdAt: { gte: from, lte: to },
          mode:      { in: TESTED_MODES },
          // Ograderade forsok bar ingen siffra att jamfora.
          wordsTotal: { not: null },
        },
        select: {
          wordsCorrect: true, wordsTotal: true,
          durationSecs: true, xpEarned: true,
        },
      },
    },
  });
  if (sections.length === 0) return empty;

  let wordsHeld = 0, wordsPossible = 0;
  let sectionsAttempted = 0, sectionsHeld = 0;
  let seconds = 0, attempts = 0, xp = 0;
  let accuracySum = 0;

  for (const s of sections) {
    const possible = wordCount(s.content);
    wordsPossible += possible;

    let best = 0;
    for (const p of s.practiceSessions) {
      const correct = p.wordsCorrect ?? 0;
      const total   = p.wordsTotal   ?? 0;

      // Ett forsok kan inte ge fler hallna ord an sektionen har. Utan
      // taket skulle en trasig rad kunna blasa upp summan.
      best = Math.max(best, Math.min(correct, possible));

      if (total > 0) accuracySum += Math.min(100, Math.round((correct / total) * 100));
      attempts += 1;
      seconds  += p.durationSecs;
      xp       += p.xpEarned;
    }

    if (s.practiceSessions.length > 0) {
      sectionsAttempted += 1;
      wordsHeld += best;
      if (possible > 0 && best / possible >= HELD_THRESHOLD) sectionsHeld += 1;
    }
  }

  return {
    wordsHeld, wordsPossible, sectionsAttempted, sectionsHeld,
    accuracy: attempts > 0 ? Math.round(accuracySum / attempts) : 0,
    seconds, attempts, xp,
  };
}

/**
 * Vem som vann, och pa vad.
 *
 * Ren funktion, sa att regeln gar att prova utan en databas. Ordningen ar
 * fast: ord forst, sedan tratsakerhet, sedan tid. Lika pa alla tre ar
 * oavgjort, och da far bada medaljen — se `settleDuel`.
 */
export function decideWinner(a: DuelSide, b: DuelSide): { winnerId: string | null; margin: DuelResult["margin"] } {
  if (a.wordsHeld !== b.wordsHeld) {
    return { winnerId: a.wordsHeld > b.wordsHeld ? a.userId : b.userId, margin: "words" };
  }
  if (a.accuracy !== b.accuracy) {
    return { winnerId: a.accuracy > b.accuracy ? a.userId : b.userId, margin: "accuracy" };
  }
  if (a.seconds !== b.seconds) {
    return { winnerId: a.seconds > b.seconds ? a.userId : b.userId, margin: "time" };
  }
  return { winnerId: null, margin: "draw" };
}

// ── Kopian ────────────────────────────────────────────────────────────

/**
 * Kopierar ett verk till nagon annans bibliotek.
 *
 * Texten foljer med, historiken gor det inte. Sektionerna borjar pa
 * not_started med noll repetitioner — annars hade mottagaren startat med
 * utmanarens framsteg och kampen varit avgjord innan den borjat.
 *
 * Delarna kopieras med, och sektionerna pekas om till de NYA delarna.
 * Missas den ompekningen far mottagaren sektioner som pekar in i nagon
 * annans verk, vilket ar bade fel och en lacka.
 */
export async function copyWorkTo(sourceWorkId: string, toUserId: string): Promise<string> {
  const source = await prisma.work.findUnique({
    where: { id: sourceWorkId },
    select: {
      title: true, author: true, type: true, tags: true,
      analysis: true, practiceAdvice: true, difficulty: true, estimatedMinutes: true,
      parts: {
        orderBy: { orderIndex: "asc" },
        select:  { id: true, name: true, orderIndex: true },
      },
      sections: {
        orderBy: { orderIndex: "asc" },
        select:  { name: true, content: true, difficulty: true, orderIndex: true, partId: true },
      },
    },
  });
  if (!source) throw new DuelError("That work no longer exists.", 404);

  const copy = await prisma.work.create({
    data: {
      userId:           toUserId,
      title:            source.title,
      author:           source.author,
      type:             source.type,
      tags:             source.tags,
      analysis:         source.analysis,
      practiceAdvice:   source.practiceAdvice,
      difficulty:       source.difficulty,
      estimatedMinutes: source.estimatedMinutes,
      // Kopian ar privat oavsett vad originalet var. Att ta emot en text
      // ar inte ett beslut om att visa upp den.
      visibility:       "private",
      parts: {
        create: source.parts.map(p => ({ name: p.name, orderIndex: p.orderIndex })),
      },
    },
    select: { id: true, parts: { orderBy: { orderIndex: "asc" }, select: { id: true } } },
  });

  // Gamla del-id → nytt del-id, i ordningsindexets ordning.
  const partMap = new Map<string, string>();
  source.parts.forEach((p, i) => {
    const created = copy.parts[i];
    if (created) partMap.set(p.id, created.id);
  });

  if (source.sections.length > 0) {
    await prisma.section.createMany({
      data: source.sections.map(s => ({
        workId:     copy.id,
        partId:     s.partId ? partMap.get(s.partId) ?? null : null,
        name:       s.name,
        content:    s.content,
        difficulty: s.difficulty,
        orderIndex: s.orderIndex,
      })),
    });
  }

  return copy.id;
}

// ── Inbjudan ──────────────────────────────────────────────────────────

/**
 * Bjuder in nagon till en tvekamp.
 *
 * Kontrollerna star i den ordning de gor for att den billigaste och mest
 * avgorande kommer forst: ar du inte Pro spelar resten ingen roll.
 */
export async function createDuel(params: {
  challengerId: string;
  ent:          Entitlements;
  opponentId:   string;
  workId:       string;
  minutes:      number;
}): Promise<{ id: string }> {
  const { challengerId, ent, opponentId, workId, minutes } = params;

  if (!ent.isPro) {
    throw new DuelError("upgrade_required", 402);
  }
  if (challengerId === opponentId) {
    throw new DuelError("You cannot challenge yourself.", 400);
  }
  if (!isValidDuration(minutes)) {
    throw new DuelError("That isn't one of the lengths on offer.", 400);
  }

  // Bara vanner. Att kunna skicka en text till vem som helst som kan
  // gissa ett handtag vore ett satt att skicka vad som helst.
  const { state } = await friendState(challengerId, opponentId);
  if (state !== "friends") {
    throw new DuelError("You can only challenge a friend.", 403);
  }

  const work = await prisma.work.findFirst({
    where:  { id: workId, userId: challengerId },
    select: { id: true, title: true, author: true, _count: { select: { sections: true } } },
  });
  if (!work) throw new DuelError("That work isn't yours to share.", 404);
  if (work._count.sections === 0) {
    throw new DuelError("There is nothing in that work to learn yet.", 400);
  }

  // En obesvarad eller pagaende kamp mellan samma tva ar nog. Utan detta
  // kan man fylla nagons inkorg med utmaningar.
  const already = await prisma.duel.findFirst({
    where: {
      status: { in: LIVE },
      OR: [
        { challengerId, opponentId },
        { challengerId: opponentId, opponentId: challengerId },
      ],
    },
    select: { id: true, status: true },
  });
  if (already) {
    throw new DuelError(
      already.status === "pending"
        ? "There is already a challenge waiting between you two."
        : "You are already in a duel with them.",
      409
    );
  }

  const duel = await prisma.duel.create({
    data: {
      challengerId,
      opponentId,
      challengerWorkId: work.id,
      workTitle:        work.title,
      workAuthor:       work.author,
      durationMinutes:  minutes,
    },
    select: { id: true },
  });

  return duel;
}

/**
 * Antar en inbjudan.
 *
 * Kopian skapas HAR, och klockan startar i samma andetag. Skapades kopian
 * redan vid inbjudan hade motstandaren fatt texten aven om de sa nej.
 *
 * Kopian raknas inte mot verksgransen vid mottagandet. En gratisanvandare
 * med fullt bibliotek ska kunna ta emot en utmaning — annars ar gransen
 * ett skal att inte ha vanner. Verket raknas som alla andra DAREFTER, sa
 * det ar ingen vag runt taket for egna tillagg.
 */
export async function acceptDuel(duelId: string, userId: string): Promise<void> {
  const duel = await prisma.duel.findUnique({
    where:  { id: duelId },
    select: { id: true, opponentId: true, status: true, challengerWorkId: true, durationMinutes: true },
  });
  if (!duel)                      throw new DuelError("No such challenge.", 404);
  if (duel.opponentId !== userId) throw new DuelError("That challenge isn't yours.", 403);
  if (duel.status !== "pending")  throw new DuelError("That challenge has already been answered.", 409);
  if (!duel.challengerWorkId)     throw new DuelError("The work behind this challenge is gone.", 410);

  const copyId = await copyWorkTo(duel.challengerWorkId, userId);

  const startedAt = new Date();
  const endsAt    = new Date(startedAt.getTime() + duel.durationMinutes * 60_000);

  // Villkoret pa status gor skrivningen till ett atomart ansprak: tva
  // samtidiga klick kan inte bada starta kampen.
  const updated = await prisma.duel.updateMany({
    where: { id: duelId, status: "pending" },
    data:  { status: "active", opponentWorkId: copyId, startedAt, endsAt },
  });

  if (updated.count === 0) {
    // Nagon annan hann fore. Stad undan kopian sa att den inte blir kvar
    // som ett spokverk i biblioteket.
    await prisma.work.delete({ where: { id: copyId } }).catch(() => {});
    throw new DuelError("That challenge has already been answered.", 409);
  }
}

/** Tackar nej. Ingen kopia har skapats an, sa det finns inget att stada. */
export async function declineDuel(duelId: string, userId: string): Promise<void> {
  const updated = await prisma.duel.updateMany({
    where: { id: duelId, opponentId: userId, status: "pending" },
    data:  { status: "declined", settledAt: new Date() },
  });
  if (updated.count === 0) throw new DuelError("Nothing to decline.", 404);
}

/** Utmanaren tar tillbaka en inbjudan som annu inte besvarats. */
export async function cancelDuel(duelId: string, userId: string): Promise<void> {
  const updated = await prisma.duel.updateMany({
    where: { id: duelId, challengerId: userId, status: "pending" },
    data:  { status: "cancelled", settledAt: new Date() },
  });
  if (updated.count === 0) throw new DuelError("Nothing to withdraw.", 404);
}

// ── Avgorandet ────────────────────────────────────────────────────────

/**
 * Avgor en kamp vars tid gatt ut.
 *
 * Kors lat: det finns ingen schemalaggare i appen, sa avgorandet sker
 * nasta gang nagon tittar. Vem som helst av de tva kan utlosa det, och
 * gor de det samtidigt far bara den ena skriva — `updateMany` med
 * villkor pa status ar det som garanterar det.
 *
 * Ar kampen redan avgjord returneras det frysta resultatet oforandrat.
 * Rakningen far ske en gang och bara en gang; en vinnare som kan byta
 * plats nasta gang sidan laddas ar ingen vinnare.
 */
export async function settleDuel(duelId: string): Promise<DuelResult | null> {
  const duel = await prisma.duel.findUnique({
    where: { id: duelId },
    select: {
      id: true, status: true, startedAt: true, endsAt: true,
      challengerId: true, opponentId: true,
      challengerWorkId: true, opponentWorkId: true,
      workTitle: true, result: true,
      challenger: { select: { id: true, username: true, handle: true, avatarUrl: true } },
      opponent:   { select: { id: true, username: true, handle: true, avatarUrl: true } },
    },
  });
  if (!duel) return null;

  if (duel.status === "finished") {
    return (duel.result as unknown as DuelResult) ?? null;
  }
  if (duel.status !== "active" || !duel.startedAt || !duel.endsAt) return null;
  if (duel.endsAt.getTime() > Date.now()) return null; // klockan gar an

  const [cStats, oStats] = await Promise.all([
    measureSide(duel.challengerWorkId, duel.startedAt, duel.endsAt),
    measureSide(duel.opponentWorkId,   duel.startedAt, duel.endsAt),
  ]);

  const challenger: DuelSide = { ...duel.challenger, userId: duel.challenger.id, ...cStats };
  const opponent:   DuelSide = { ...duel.opponent,   userId: duel.opponent.id,   ...oStats };

  const { winnerId, margin } = decideWinner(challenger, opponent);
  const result: DuelResult = { challenger, opponent, winnerId, margin };

  const claimed = await prisma.duel.updateMany({
    where: { id: duelId, status: "active" },
    data: {
      status:    "finished",
      settledAt: new Date(),
      winnerId,
      result:    result as unknown as object,
    },
  });

  // Nagon annan hann avgora den. Deras siffror galler, inte vara.
  if (claimed.count === 0) {
    const fresh = await prisma.duel.findUnique({ where: { id: duelId }, select: { result: true } });
    return (fresh?.result as unknown as DuelResult) ?? null;
  }

  await awardBattleMedals(duel.id, duel.workTitle, {
    challenger: { userId: duel.challengerId, workId: duel.challengerWorkId },
    opponent:   { userId: duel.opponentId,   workId: duel.opponentWorkId },
  }, winnerId);

  return result;
}

/**
 * Medaljen till den som vann.
 *
 * Oavgjort ger bada en — de holl lika mycket, och det ar inte ett
 * misslyckande. Medaljen ar av sorten "battle" och kan inte forloras:
 * till skillnad fran framforandetiteln star den for en dag som redan ar
 * over och inte for ett tillstand som ska underhallas.
 *
 * Unikheten pa [userId, duelId] gor utdelningen idempotent. Den behovs:
 * avgorandet sker lat, och tva samtidiga sidladdningar kan na hit.
 */
async function awardBattleMedals(
  duelId:    string,
  workTitle: string,
  sides:     { challenger: { userId: string; workId: string | null }; opponent: { userId: string; workId: string | null } },
  winnerId:  string | null
): Promise<void> {
  const winners = winnerId === null
    ? [sides.challenger, sides.opponent]
    : [sides.challenger, sides.opponent].filter(s => s.userId === winnerId);

  for (const side of winners) {
    // Verket kan ha raderats mitt i kampen. Medaljen kraver ett verk att
    // hanga pa, sa da far den utga — hellre det an en trasig rad.
    if (!side.workId) continue;

    await prisma.medal.create({
      data: {
        userId:  side.userId,
        workId:  side.workId,
        duelId,
        kind:    "battle",
        title:   winnerId === null ? `Held even: ${workTitle}` : `Victor: ${workTitle}`,
      },
    }).catch(() => {});  // redan utdelad — unikheten gjorde sitt jobb

    // Texten namnger ALDRIG verket, aven om medaljen gor det.
    //
    // Skillnaden: medaljens titel visas bara nar verket ar publikt — den
    // kontrollen sitter i MedalCard och pa profilsidan. Ett inlagg har
    // ingen sadan sil for sin brodtext; posts.ts kan dolja titeln den
    // LANKAR till, men inte orden i kroppen. Star titeln dar hamnar ett
    // privat verks namn i vannernas flode, och synlighetsvaljaren ar en
    // logn. Samma regel foljer framforandena i performanceStore.
    await recordMilestone(
      side.userId,
      side.workId,
      winnerId === null
        ? "Fought a duel to a draw."
        : "Won a duel."
    ).catch(() => {});
  }
}

// ── Vad granssnittet fragar om ────────────────────────────────────────

export interface DuelBadge {
  duelId:    string;
  /** Sant sa lange klockan gar. Falskt nar tiden ar ute men obestamd. */
  running:   boolean;
  endsAt:    Date;
  opponentName: string;
}

/**
 * Vilka av dessa verk som star under en pagaende tvekamp.
 *
 * EN fraga for hela biblioteket, inte en per kort. Kartan ar nycklad pa
 * verk-id sa att WorkCard bara behover sla upp sitt eget.
 */
export async function duelBadgesForWorks(
  userId:  string,
  workIds: string[]
): Promise<Map<string, DuelBadge>> {
  const badges = new Map<string, DuelBadge>();
  if (workIds.length === 0) return badges;

  const rows = await prisma.duel.findMany({
    where: {
      status: "active",
      OR: [
        { challengerId: userId, challengerWorkId: { in: workIds } },
        { opponentId:   userId, opponentWorkId:   { in: workIds } },
      ],
    },
    select: {
      id: true, endsAt: true, challengerId: true,
      challengerWorkId: true, opponentWorkId: true,
      challenger: { select: { username: true } },
      opponent:   { select: { username: true } },
    },
  });

  const now = Date.now();
  for (const r of rows) {
    const mine = r.challengerId === userId ? r.challengerWorkId : r.opponentWorkId;
    if (!mine || !r.endsAt) continue;
    badges.set(mine, {
      duelId:       r.id,
      running:      r.endsAt.getTime() > now,
      endsAt:       r.endsAt,
      opponentName: r.challengerId === userId ? r.opponent.username : r.challenger.username,
    });
  }

  return badges;
}

/**
 * Kampen som just det har verket star i, sett fran anvandarens hall.
 *
 * Anvands av verkssidan for klockan, och av `duelEntitlements` for att
 * avgora om verktygen ska vara upplasta.
 */
export async function duelForWork(userId: string, workId: string) {
  return prisma.duel.findFirst({
    where: {
      status: { in: LIVE },
      OR: [
        { challengerId: userId, challengerWorkId: workId },
        { opponentId:   userId, opponentWorkId:   workId },
      ],
    },
    select: {
      id: true, status: true, endsAt: true, startedAt: true,
      durationMinutes: true, workTitle: true, challengerId: true,
      challenger: { select: { id: true, username: true, handle: true, avatarUrl: true } },
      opponent:   { select: { id: true, username: true, handle: true, avatarUrl: true } },
    },
  });
}

/**
 * Behorigheterna som galler for ETT verk, med tvekampen inraknad.
 *
 * En tvekamp dar den ena sidan har narlasning och studiepass och den
 * andra inte har det ar ingen tvekamp — den ar avgjord av vem som betalar.
 * Sa lange klockan gar far darfor bada Pro-verktygen, men BARA pa det
 * verk kampen galler. Nar den ar over faller behorigheten tillbaka till
 * personens egen plan; texten far de behalla, verktygen var lanade.
 *
 * Kallan star kvar som "duel" sa att gransnittet kan saga varfor nagot ar
 * upplast, och sa att fakturasidan inte borjar tro att nagon betalar.
 */
export async function duelEntitlements(
  userId: string,
  ent:    Entitlements,
  workId: string
): Promise<Entitlements> {
  if (ent.isPro) return ent;

  const duel = await prisma.duel.findFirst({
    where: {
      status: "active",
      endsAt: { gt: new Date() },
      OR: [
        { challengerId: userId, challengerWorkId: workId },
        { opponentId:   userId, opponentWorkId:   workId },
      ],
    },
    select: { id: true },
  });
  if (!duel) return ent;

  return {
    ...entitlementsForPlan("pro", "grant", ent.status, ent.currentPeriodEnd, ent.cancelAtPeriodEnd),
    // Gransen for antal verk ar inte en del av lanet. Den hor till kontot,
    // inte till kampen, och ska inte kunna kringgas genom att sta i en.
    limits: ent.limits,
  };
}

/** Sektionens verk, for de router som bara far ett sectionId. */
export async function duelEntitlementsForSection(
  userId:    string,
  ent:       Entitlements,
  sectionId: string
): Promise<Entitlements> {
  if (ent.isPro) return ent;
  const section = await prisma.section.findUnique({
    where:  { id: sectionId },
    select: { workId: true },
  });
  if (!section) return ent;
  return duelEntitlements(userId, ent, section.workId);
}

// ── Listorna ──────────────────────────────────────────────────────────

export interface DuelCard {
  id:        string;
  status:    DuelStatus;
  role:      "challenger" | "opponent";
  workTitle: string;
  workAuthor: string;
  /** Ens egen kopia, nar den finns. Lanken till att borja ova. */
  myWorkId:  string | null;
  minutes:   number;
  endsAt:    string | null;
  settledAt: string | null;
  /** Sant nar klockan gatt ut men resultatet annu inte hamtats. */
  awaitingResult: boolean;
  winnerId:  string | null;
  other: {
    id: string; username: string; handle: string | null; avatarUrl: string | null;
  };
}

/**
 * Allt en person har pa gang: inbjudningar at bada hall, pagaende kamper
 * och de senast avgjorda.
 *
 * Avgorandet sker inte har. Listan far vara en las-operation; den som vill
 * ha resultatet ber om det, och da kors settleDuel.
 */
export async function listDuels(userId: string): Promise<DuelCard[]> {
  const rows = await prisma.duel.findMany({
    where: {
      OR: [{ challengerId: userId }, { opponentId: userId }],
      // Avbojda och tillbakadragna ar inte historia nagon vill lasa.
      status: { in: ["pending", "active", "finished"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, status: true, workTitle: true, workAuthor: true,
      durationMinutes: true, endsAt: true, settledAt: true, winnerId: true,
      challengerId: true, challengerWorkId: true, opponentWorkId: true,
      challenger: { select: { id: true, username: true, handle: true, avatarUrl: true } },
      opponent:   { select: { id: true, username: true, handle: true, avatarUrl: true } },
    },
  });

  const now = Date.now();

  return rows.map(r => {
    const mine = r.challengerId === userId;
    return {
      id:        r.id,
      status:    r.status as DuelStatus,
      role:      mine ? "challenger" : "opponent",
      workTitle: r.workTitle,
      workAuthor: r.workAuthor,
      myWorkId:  mine ? r.challengerWorkId : r.opponentWorkId,
      minutes:   r.durationMinutes,
      endsAt:    r.endsAt?.toISOString() ?? null,
      settledAt: r.settledAt?.toISOString() ?? null,
      awaitingResult:
        r.status === "active" && r.endsAt !== null && r.endsAt.getTime() <= now,
      winnerId:  r.winnerId,
      other:     mine ? r.opponent : r.challenger,
    };
  });
}

/** Verk man kan satsa i en kamp: egna, med minst en sektion. */
export async function challengeableWorks(userId: string) {
  const works = await prisma.work.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
    select:  { id: true, title: true, author: true, _count: { select: { sections: true } } },
  });
  return works
    .filter(w => w._count.sections > 0)
    .map(w => ({ id: w.id, title: w.title, author: w.author, sections: w._count.sections }));
}

/** Frysta siffror for en avgjord kamp, eller null om den annu gar. */
export async function duelResult(duelId: string, userId: string): Promise<DuelResult | null> {
  const duel = await prisma.duel.findUnique({
    where:  { id: duelId },
    select: { challengerId: true, opponentId: true },
  });
  if (!duel) throw new DuelError("No such duel.", 404);
  if (duel.challengerId !== userId && duel.opponentId !== userId) {
    // Ett resultat ror tva personer. Ingen tredje behover se det.
    throw new DuelError("That duel isn't yours.", 403);
  }
  return settleDuel(duelId);
}
