// app/api/performance/route.ts
// POST → registrera ett framforande.
//
// Klienten skickar sitt transkript, aldrig originalet. Servern hamtar
// textan sjalv och jamfor — annars hade man kunnat skicka in en kortare
// text att bedomas mot och kopa mastartiteln for tio meningar.
//
// Jamforelsen ar Levenshtein pa ordniva, samma som ovningsrattningen.
// Ingen modell ar inblandad: mastartiteln maste vara reproducerbar, och
// den maste kosta noll att dela ut.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { gradeAttempt } from "@/lib/cue";
import { recordRun } from "@/lib/performanceStore";
import { accuracyPercent } from "@/lib/mastery";
import { recordWholeWorkAttempt } from "@/lib/weakSpots";

/** Se motsvarande funktion i practice/grade — samma sanering. */
function hesitatedFrom(body: Record<string, unknown>): number[] {
  const raw = body.hesitatedAt;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(Number)
    .filter(n => Number.isInteger(n) && n >= 0 && n < 100_000)
    .slice(0, 400);
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await session();

    const limited = await rateLimit(`performance:${user.id}`, 20);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const workId     = typeof body.workId     === "string" ? body.workId     : "";
    const partId     = typeof body.partId     === "string" ? body.partId     : null;
    const transcript = typeof body.transcript === "string" ? body.transcript : "";

    if (!workId)          return NextResponse.json({ error: "Missing workId" }, { status: 400 });
    if (!transcript.trim()) return NextResponse.json({ error: "Nothing was recited" }, { status: 400 });

    const work = await prisma.work.findFirst({
      where:  { id: workId, userId: user.id },
      select: { id: true, title: true },
    });
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sections = await prisma.section.findMany({
      where:   { workId, ...(partId ? { partId } : {}) },
      orderBy: { orderIndex: "asc" },
      select:  { id: true, name: true, content: true },
    });
    if (!sections.length) {
      return NextResponse.json({ error: "Nothing to perform" }, { status: 400 });
    }

    const fullText = sections.map(s => s.content).join("\n\n");
    const graded   = gradeAttempt(fullText, transcript);

    const total   = graded.diff.length;
    const correct = graded.diff.filter(d => d.correct).length;
    const accuracy = accuracyPercent(correct, total);

    // Hur manga sektioner som i praktiken foll bort: en sektion raknas som
    // missad nar merparten av dess ord inte kom med.
    const missedSet = new Set(graded.missed);
    const missedSections = sections.filter(s => {
      const words = s.content.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
      if (!words.length) return false;
      const lost = words.filter(w => missedSet.has(w)).length;
      return lost / words.length > 0.5;
    }).length;

    // Ett framforande ur minnet ar det strangaste provet appen har, sa
    // det som foll bort dar vager tyngst av allt. Rattningen gjordes mot
    // sektionerna hopfogade i ordning, och delas upp igen pa samma satt.
    await recordWholeWorkAttempt(sections, graded.diff, {
      // Ett framforande sker alltid utan stod — det ar hela poangen med
      // laget — sa missarna vager sin grundvikt.
      cueLevel:    "hidden",
      hesitatedAt: hesitatedFrom(body),
    }).catch(err => {
      console.error("Could not record weak spots:", err);
    });

    const result = await recordRun({
      userId: user.id,
      workId,
      partId,
      accuracy,
      hesitations:    Number.isFinite(body.hesitations)    ? Math.max(0, Math.floor(body.hesitations))    : 0,
      longestPauseMs: Number.isFinite(body.longestPauseMs) ? Math.max(0, Math.floor(body.longestPauseMs)) : 0,
      durationSecs:   Number.isFinite(body.durationSecs)   ? Math.max(0, Math.floor(body.durationSecs))   : 0,
      missedSections,
      detail: { wordsTotal: total, wordsCorrect: correct, missed: graded.missed.slice(0, 12) },
    });

    return NextResponse.json({
      ...result,
      wordsTotal:   total,
      wordsCorrect: correct,
      missed:       graded.missed,
      diff:         graded.diff,
      missedSections,
      workTitle:    work.title,
    });
  } catch (err) {
    return toResponse(err);
  }
}
