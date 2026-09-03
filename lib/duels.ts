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
// BARA tvekampsforsok. Ett tvekampsforsok ar ett framforande av hela
// verket ur minnet, gjort via rostlaget fran tvekampssidan.
//
// Ovningen raknas inte. Ovar man for att lara sig ger det XP och flyttar
// inlarningskurvan i biblioteket; det ar en annan sak an att stalla sig
// upp och visa vad man kan, och kampen mater bara det senare. Ingen
// traning allokeras till tvekampens siffra, och tvekampen ror inte SM-2.
//
// Det ar avsiktligt inte heller SM-2-status. En tio minuters tvekamp
// hinner aldrig flytta en sektion till "mastered" — intervallet kraver
// veckor — sa ett matt byggt pa status hade gett 0–0 i varje kort kamp.
//
// Siffran som avgor ar ORD SOM HALLS i det basta forsoket, vilket ar
// samma matt appen redan visar efter ett framforande ("32 of 40 words
// held"). Rattningen ar densamma som overallt annars: lib/cue.ts,
// Levenshtein pa ordniva, ingen modell inblandad. En vinnare som en
// sprakmodell utsett hade varken gatt att reproducera eller att lita pa.
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
import { gradeAttempt, pickBestTranscript } from "./cue";
import { accuracyPercent } from "./mastery";
import { recordWholeWorkAttempt } from "./weakSpots";

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
  /** Ord som satt i det BASTA tvekampsforsoket. Det som avgor. */
  wordsHeld:     number;
  /** Hur manga ord verket bestar av. Samma for bada — samma text. */
  wordsPossible: number;
  /** Traffsakerheten i samma basta forsok, 0-100. Forsta skiljetecknet. */
  accuracy:  number;
  /** Nar det basta forsoket gjordes. Andra skiljetecknet. */
  bestAt:    string | null;
  /** Antal tvekampsforsok. Visas, avgor inget. */
  attempts:  number;
  /** Sekunder tillbringade i tvekampslaget. Visas, avgor inget. */
  seconds:   number;
}

export interface DuelResult {
  challenger: DuelSide;
  opponent:   DuelSide;
  /** null = oavgjort. */
  winnerId:   string | null;
  /** Vad som skilde dem at. For en rad text i resultatet. */
  margin:     "words" | "accuracy" | "first" | "draw";
}

/**
 * Hur mycket en person holl, matt PA TVEKAMPSFORSOKEN och ingenting annat.
 *
 * ── Varfor inte ovningshistoriken ────────────────────────────────────
 *
 * Den forsta versionen raknade write- och recite-pass inom tidsfonstret.
 * Det var fel av tva skal.
 *
 * Ingen traning ska allokeras till tvekampens siffra. Ovar man for att
 * lara sig ska det ge XP och flytta inlarningskurvan; det ar en annan sak
 * an att stalla sig upp och visa vad man kan. Blandas de blir kampen en
 * matning av hur mycket man klickat.
 *
 * Och sektionsvis matning gick att spela: den som ovade en strof i taget
 * kunde samla ihop en hog totalsumma utan att nagon gang ha hallit hela
 * texten i huvudet samtidigt. Ett framforande av HELA verket kan inte
 * delas upp sa.
 *
 * Basta forsoket galler, inte det senaste och inte summan. Den som redan
 * visat vad de kan ska inte kunna forlora det pa ett daligt sista forsok,
 * och tio medelmattiga forsok ska inte slå ett bra.
 */
export async function measureSide(
  duelId: string,
  userId: string
): Promise<Omit<DuelSide, "userId" | "username" | "handle" | "avatarUrl">> {
  const [rows, aggregate] = await Promise.all([
    prisma.duelAttempt.findMany({
      where:   { duelId, userId },
      // Flest ord forst; vid lika vinner det som gjordes FORST. Det ar
      // samma regel som decideWinner anvander mellan tva personer, och
      // den maste galla inom en person ocksa — annars kan `bestAt` peka
      // pa ett senare forsok som inte var battre.
      orderBy: [{ wordsCorrect: "desc" }, { createdAt: "asc" }],
      take: 1,
      select: { wordsCorrect: true, wordsTotal: true, accuracy: true, createdAt: true },
    }),
    prisma.duelAttempt.aggregate({
      where:  { duelId, userId },
      _count: { _all: true },
      _sum:   { durationSecs: true },
    }),
  ]);

  const best = rows[0];

  return {
    wordsHeld:     best?.wordsCorrect ?? 0,
    wordsPossible: best?.wordsTotal   ?? 0,
    accuracy:      best?.accuracy     ?? 0,
    bestAt:        best?.createdAt.toISOString() ?? null,
    attempts:      aggregate._count._all,
    seconds:       aggregate._sum.durationSecs ?? 0,
  };
}

/**
 * Vem som vann, och pa vad.
 *
 * Ren funktion, sa att regeln gar att prova utan en databas. Ordningen ar
 * fast: ord forst, sedan traffsakerhet, sedan vem som kom dit forst.
 *
 * Det sista kriteriet ar med flit inte "mest tid vid texten". Att sitta
 * lange ar inte att kunna nagot, och ett kriterium som beloner tid gor
 * kampen till en uthallighetsprovning. Kom ni lika langt vinner den som
 * kom dit forst.
 */
export function decideWinner(a: DuelSide, b: DuelSide): { winnerId: string | null; margin: DuelResult["margin"] } {
  if (a.wordsHeld !== b.wordsHeld) {
    return { winnerId: a.wordsHeld > b.wordsHeld ? a.userId : b.userId, margin: "words" };
  }
  if (a.accuracy !== b.accuracy) {
    return { winnerId: a.accuracy > b.accuracy ? a.userId : b.userId, margin: "accuracy" };
  }

  // Ingen av dem stallde sig upp alls. Da har ingen visat nagot, och det
  // ar oavgjort — inte en seger till den som rakar ha ett tidigare id.
  if (a.bestAt === null && b.bestAt === null) return { winnerId: null, margin: "draw" };
  if (a.bestAt === null) return { winnerId: b.userId, margin: "first" };
  if (b.bestAt === null) return { winnerId: a.userId, margin: "first" };

  if (a.bestAt !== b.bestAt) {
    return { winnerId: a.bestAt < b.bestAt ? a.userId : b.userId, margin: "first" };
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
    measureSide(duel.id, duel.challengerId),
    measureSide(duel.id, duel.opponentId),
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

// ── Tvekampsforsoket ──────────────────────────────────────────────────

export interface DuelAttemptResult {
  accuracy:     number;
  wordsTotal:   number;
  wordsCorrect: number;
  missed:       string[];
  /** Sant nar forsoket slog det tidigare basta. */
  isBest:       boolean;
  /** Laget efter forsoket: mitt basta mot deras. */
  mine:         { wordsHeld: number; wordsPossible: number; accuracy: number; attempts: number };
  theirs:       { wordsHeld: number; accuracy: number; attempts: number };
}

/**
 * Den egna sidan av en pagaende tvekamp — verk, motstandare, klocka.
 *
 * Kastar hellre an returnerar null, sa att varje anropare far ett
 * meddelande att visa i stallet for att behova gissa vad som gick fel.
 */
export async function duelSideFor(duelId: string, userId: string) {
  const duel = await prisma.duel.findUnique({
    where: { id: duelId },
    select: {
      id: true, status: true, startedAt: true, endsAt: true, workTitle: true,
      workAuthor: true, durationMinutes: true,
      challengerId: true, opponentId: true,
      challengerWorkId: true, opponentWorkId: true,
      challenger: { select: { id: true, username: true, handle: true, avatarUrl: true } },
      opponent:   { select: { id: true, username: true, handle: true, avatarUrl: true } },
    },
  });
  if (!duel) throw new DuelError("No such duel.", 404);

  const mine = duel.challengerId === userId;
  if (!mine && duel.opponentId !== userId) {
    throw new DuelError("That duel isn't yours.", 403);
  }

  return {
    duel,
    myWorkId: mine ? duel.challengerWorkId : duel.opponentWorkId,
    other:    mine ? duel.opponent : duel.challenger,
    otherId:  mine ? duel.opponentId : duel.challengerId,
  };
}

/**
 * Skriver ned ett tvekampsforsok.
 *
 * Vad den medvetet INTE gor: ingen XP, ingen SM-2, ingen PracticeSession,
 * ingen Performance-rad, ingen medalj, ingen milstolpe, ingen streak.
 * Ett forsok har raknas for kampen och for ingenting annat — det var sa
 * det bestalldes, och det ar ocksa det enda satt pa vilket kampen kan
 * mata nagot som ovningen inte redan mater.
 *
 * Texten hamtas pa servern ur den egna kopian. Klienten skickar sitt
 * transkript, aldrig originalet — annars hade man kunnat skicka in en
 * kortare text att bedomas mot och kopa segern for tva rader.
 */
export async function recordDuelAttempt(params: {
  duelId:     string;
  userId:     string;
  transcript: string;
  durationSecs?:   number;
  hesitations?:    number;
  longestPauseMs?: number;
  /** Platser i forsoket dar det blev tyst lange innan ordet kom. */
  hesitatedAt?:    number[];
  /** Rostmotorns egna alternativ, en lista per bit. */
  chunks?:         string[][];
}): Promise<DuelAttemptResult> {
  const { duelId, userId, transcript } = params;

  const { duel, myWorkId, otherId } = await duelSideFor(duelId, userId);

  if (duel.status !== "active") {
    throw new DuelError(
      duel.status === "pending"
        ? "That duel hasn't been accepted yet."
        : "That duel is over.",
      409
    );
  }
  if (!duel.endsAt || duel.endsAt.getTime() <= Date.now()) {
    throw new DuelError("Time is up. Ask for the result.", 409);
  }
  if (!myWorkId) throw new DuelError("Your copy of that work is gone.", 410);
  if (!transcript.trim()) throw new DuelError("Nothing was picked up.", 400);

  const sections = await prisma.section.findMany({
    where:   { workId: myWorkId },
    orderBy: { orderIndex: "asc" },
    select:  { id: true, content: true },
  });
  if (sections.length === 0) throw new DuelError("There is nothing to perform.", 400);

  // Ocksa alltid talat. Motorns alternativ vags mot texten och homofoner
  // raknas lika — se kommentaren i app/api/practice/grade.
  const fullText = sections.map(s => s.content).join("\n\n");
  const spoken   = { spoken: true };
  const best     = (params.chunks?.length ?? 0) > 0
    ? pickBestTranscript(fullText, params.chunks!, spoken)
    : transcript;

  const graded = gradeAttempt(fullText, best, spoken);
  const total   = graded.diff.length;
  const correct = graded.diff.filter(d => d.correct).length;

  // Ett tvekampsforsok ger varken XP eller SM-2 — men det ar riktig
  // atergivning ur minnet, och var texten foll ar lika sant dar som
  // nagon annanstans. Svagheten ar en hjalp at anvandaren, inte en del
  // av kampens rakning, sa den bryter inte regeln ovan.
  await recordWholeWorkAttempt(sections, graded.diff, {
    cueLevel:    "hidden",
    hesitatedAt: params.hesitatedAt ?? [],
  }).catch(() => {});

  const before = await measureSide(duelId, userId);

  await prisma.duelAttempt.create({
    data: {
      duelId, userId, workId: myWorkId,
      accuracy:       accuracyPercent(correct, total),
      wordsTotal:     total,
      wordsCorrect:   correct,
      durationSecs:   clamp(params.durationSecs),
      hesitations:    clamp(params.hesitations),
      longestPauseMs: params.longestPauseMs === undefined ? null : clamp(params.longestPauseMs),
      missedWords:    graded.missed.slice(0, 24).map(w => String(w).slice(0, 40)),
    },
  });

  const [mine, theirs] = await Promise.all([
    measureSide(duelId, userId),
    measureSide(duelId, otherId),
  ]);

  return {
    accuracy:     accuracyPercent(correct, total),
    wordsTotal:   total,
    wordsCorrect: correct,
    missed:       graded.missed,
    isBest:       correct > before.wordsHeld,
    mine: {
      wordsHeld: mine.wordsHeld, wordsPossible: mine.wordsPossible,
      accuracy:  mine.accuracy,  attempts: mine.attempts,
    },
    theirs: {
      wordsHeld: theirs.wordsHeld, accuracy: theirs.accuracy, attempts: theirs.attempts,
    },
  };
}

function clamp(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
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

    // Ingen milstolpe i flodet.
    //
    // En vunnen tvekamp skrevs tidigare ut som ett inlagg hos vannerna.
    // Det ar fel stalle: en tvekamp ar nagot som star MELLAN tva personer,
    // och det som ar intressant ar hur det gatt dem emellan — inte en rad
    // i ett flode som alla andra scrollar forbi. Stallningen visas i
    // stallet pa motstandarens profil, dar man faktiskt undrar over den.
    // Se duelRecordAgainst().
  }
}

// ── Stallningen mellan tva ────────────────────────────────────────────

export interface DuelRecord {
  wins:   number;
  losses: number;
  draws:  number;
  /** Alla avgjorda kamper mellan de tva. Noll = de har aldrig motts. */
  total:  number;
}

/**
 * Hur det gatt mellan tva personer, sett fran den forstas hall.
 *
 * En fraga, tre siffror. Bara AVGJORDA kamper raknas — en pagaende har
 * inget utfall an, och en avbojd inbjudan ar ingen match.
 *
 * Oavgjort ar sitt eget utfall och inte en halv vinst: bada holl lika
 * mycket, och det ar nagot annat an att ha vunnit knappt.
 */
export async function duelRecordAgainst(
  userId:  string,
  otherId: string
): Promise<DuelRecord> {
  const rows = await prisma.duel.findMany({
    where: {
      status: "finished",
      OR: [
        { challengerId: userId,  opponentId:   otherId },
        { challengerId: otherId, opponentId:   userId  },
      ],
    },
    select: { winnerId: true },
  });

  let wins = 0, losses = 0, draws = 0;
  for (const r of rows) {
    if (r.winnerId === null)      draws  += 1;
    else if (r.winnerId === userId) wins   += 1;
    else                            losses += 1;
  }

  return { wins, losses, draws, total: rows.length };
}

// ── Vad granssnittet fragar om ────────────────────────────────────────

// ── Notiser pa Friends-fliken ─────────────────────────────────────────

export interface DuelNotices {
  /** Inbjudningar som vantar pa ditt svar. Guld bubbla. */
  invites:  number;
  /** Inbjudningar DU skickat som nyss antagits. Gron bubbla. */
  accepted: number;
}

/**
 * Vad som ska lysa pa Friends-fliken.
 *
 * Tva olika bubblor, for att de betyder olika saker och kraver olika
 * svar. En inbjudan vantar pa DIG och slocknar nar du svarar. Ett antaget
 * ja ar en nyhet — kampen har borjat och klockan gar — och den slocknar
 * nar du sett den, inte nar kampen ar over. En notis som lyser i sju
 * dagar ar ingen notis, den ar en dekoration man slutar se.
 *
 * Rakningen ar tva count-fragor, inte en lista som kastas bort. Den kors
 * i layouten vid varje sidladdning.
 */
export async function duelNotices(userId: string): Promise<DuelNotices> {
  const [invites, accepted] = await Promise.all([
    prisma.duel.count({
      where: { opponentId: userId, status: "pending" },
    }),
    prisma.duel.count({
      where: {
        challengerId:   userId,
        status:         "active",
        acceptedSeenAt: null,
      },
    }),
  ]);

  return { invites, accepted };
}

/**
 * Kvitterar de grona bubblorna.
 *
 * Anropas nar utmanaren faktiskt oppnat Friends-sidan, inte nar de
 * hovrar over fliken. `updateMany` utan las: att kvittera tva ganger
 * kostar inget och kan inte bli fel.
 */
export async function markAcceptancesSeen(userId: string): Promise<void> {
  await prisma.duel.updateMany({
    where: { challengerId: userId, status: "active", acceptedSeenAt: null },
    data:  { acceptedSeenAt: new Date() },
  });
}

/**
 * Tvekamperna mellan anvandaren och var och en av dessa personer.
 *
 * En fraga for hela vanlistan, inte en per rad.
 *
 * Finns for att en pagaende kamp tidigare bara gick att se pa verket. Var
 * i granssnittet man an motte sin motstandare — i listan, pa deras profil
 * — stod det ingenting om att man var mitt i nagot med dem, och det ar
 * dar man ar nar man tanker pa dem.
 */
export interface DuelWith {
  id:       string;
  status:   "pending" | "active";
  endsAt:   Date | null;
  /** Sant nar det ar DU som skickade inbjudan. */
  mine:     boolean;
  workTitle: string;
}

export async function duelsWithPeople(
  userId:   string,
  otherIds: string[]
): Promise<Map<string, DuelWith>> {
  const out = new Map<string, DuelWith>();
  if (otherIds.length === 0) return out;

  const rows = await prisma.duel.findMany({
    where: {
      status: { in: LIVE },
      OR: [
        { challengerId: userId, opponentId:   { in: otherIds } },
        { opponentId:   userId, challengerId: { in: otherIds } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, status: true, endsAt: true, workTitle: true,
      challengerId: true, opponentId: true,
    },
  });

  for (const r of rows) {
    const mine  = r.challengerId === userId;
    const other = mine ? r.opponentId : r.challengerId;
    // Nyast forst i sorteringen ovan, sa den forsta traffen far sta.
    if (out.has(other)) continue;
    out.set(other, {
      id:        r.id,
      status:    r.status as "pending" | "active",
      endsAt:    r.endsAt,
      mine,
      workTitle: r.workTitle,
    });
  }

  return out;
}

export interface DuelBadge {
  duelId:    string;
  /** Sant sa lange klockan gar. Falskt nar tiden ar ute men obestamd. */
  running:   boolean;
  endsAt:    Date;
  opponentName: string;
  /** Ditt basta framforande hittills. null innan du gjort nagot. */
  best:      { wordsHeld: number; wordsPossible: number; accuracy: number } | null;
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

  // Basta forsoket per kamp, for alla kamper pa en gang. En groupBy i
  // stallet for en fraga per kort — biblioteket far inte bli langsammare
  // for att man rakar sta i tva tvekamper.
  const bests = await prisma.duelAttempt.groupBy({
    by:    ["duelId"],
    where: { duelId: { in: rows.map(r => r.id) }, userId },
    _max:  { wordsCorrect: true, accuracy: true, wordsTotal: true },
  });
  const bestByDuel = new Map(bests.map(b => [b.duelId, b._max]));

  for (const r of rows) {
    const mine = r.challengerId === userId ? r.challengerWorkId : r.opponentWorkId;
    if (!mine || !r.endsAt) continue;

    const max = bestByDuel.get(r.id);
    badges.set(mine, {
      duelId:       r.id,
      running:      r.endsAt.getTime() > now,
      endsAt:       r.endsAt,
      opponentName: r.challengerId === userId ? r.opponent.username : r.challenger.username,
      best: max?.wordsCorrect === null || max === undefined ? null : {
        wordsHeld:     max.wordsCorrect ?? 0,
        wordsPossible: max.wordsTotal   ?? 0,
        accuracy:      max.accuracy     ?? 0,
      },
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
