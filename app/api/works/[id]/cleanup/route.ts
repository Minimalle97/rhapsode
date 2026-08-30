// app/api/works/[id]/cleanup/route.ts
//
// POST { mode: "basic" | "advanced", apply?, instructions?, sectionIds? }
//
// basic    — reglar. Ogonblicklig, gratis, obegransad, ingen modell.
// advanced — modellen. Egen manadsranson: tva for Free, obegransat for Pro.
//
// Bada svarar med en FORHANDSGRANSKNING som standard. Ingenting skrivs
// forran apply: true kommer in. Att stada en text ar destruktivt, och man
// ska fa se vad som forsvinner innan det gor det.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { basicCleanup, summarise, type CleanupChange } from "@/lib/cleanup";
import { canUseFeature, requireFeature } from "@/lib/billing/entitlements";
import { FEATURE } from "@/lib/billing/plans";
import { consume, release, monthWindow, peek } from "@/lib/usage/counters";
import { runAi } from "@/lib/ai/run";
import { asDocument, parseJsonBlock, UNTRUSTED_INPUT_RULE } from "@/lib/anthropic";

interface Ctx { params: Promise<{ id: string }> }

/** Sektioner som far ga till modellen i ett svep. */
const AI_SECTION_BUDGET = 40;
const AI_CHAR_BUDGET    = 24_000;

interface CleanedSection { id: string; content: string }

const SYSTEM_PROMPT = [
  "You repair texts that were scanned or converted badly, for a memorisation app.",
  "Your job is REPAIR, never rewriting.",
  "",
  "Rules, in order of importance:",
  "- Never change a word of the work itself. No modernising, no correcting the",
  "  author, no smoothing of style.",
  "- Restore stanza and line breaks where conversion destroyed them. Verse lines",
  "  must stay on separate lines.",
  "- Remove artefacts: running heads, catchwords, stranded footnote markers,",
  "  column bleed, repeated page furniture.",
  "- Repair punctuation only where scanning clearly broke it.",
  "- If a section duplicates another, say so in notes rather than deleting it.",
  "",
  UNTRUSTED_INPUT_RULE,
  "",
  "Each section arrives as [id] followed by its text. Return ONLY JSON:",
  '{"sections":[{"id":"...","content":"..."}],"notes":["..."]}',
  "Include a section only if you changed it.",
].join("\n");

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { user, ent } = await session();

    const limited = await rateLimit(`cleanup:${user.id}`, 30, 3600);
    if (limited) return limited;

    const work = await prisma.work.findFirst({
      where:  { id, userId: user.id },
      select: { id: true, title: true, author: true },
    });
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body  = await req.json().catch(() => ({}));
    const mode  = body.mode === "advanced" ? "advanced" : "basic";
    const apply = body.apply === true;
    const only: string[] | null = Array.isArray(body.sectionIds) ? body.sectionIds : null;

    const sections = await prisma.section.findMany({
      where:   { workId: id, ...(only ? { id: { in: only } } : {}) },
      orderBy: { orderIndex: "asc" },
      select:  { id: true, name: true, content: true },
    });
    if (!sections.length) {
      return NextResponse.json({ error: "Nothing to clean" }, { status: 400 });
    }

    // ── Gratis: reglar ────────────────────────────────────────────
    if (mode === "basic") {
      requireFeature(ent, FEATURE.BASIC_CLEANUP);

      const cleaned: CleanedSection[] = [];
      const totals = new Map<string, number>();
      let before = 0, after = 0;

      for (const s of sections) {
        const result = basicCleanup(s.content);
        before += result.before;
        after  += result.after;
        for (const c of result.changes) {
          totals.set(c.label, (totals.get(c.label) ?? 0) + c.count);
        }
        if (result.text !== s.content) cleaned.push({ id: s.id, content: result.text });
      }

      const changes: CleanupChange[] = [...totals].map(([label, count]) => ({ label, count }));

      if (apply) await writeBack(cleaned);

      return NextResponse.json({
        mode:    "basic",
        applied: apply,
        changed: cleaned.length,
        changes,
        summary: summarise({ text: "", changes, before, after }),
        preview: apply ? [] : cleaned.slice(0, 8),
      });
    }

    // ── Pro-lagret: modellen ──────────────────────────────────────
    //
    // Behorigheten finns i BADA planerna. Det som skiljer ar rakningen —
    // Free har tva i manaden. Funktionen ar alltsa inte last, den tar
    // slut, och det ar forst DA erbjudandet dyker upp.
    requireFeature(ent, FEATURE.ADVANCED_CLEANUP);

    if (sections.length > AI_SECTION_BUDGET) {
      return NextResponse.json(
        {
          error:   "too_large",
          limit:   AI_SECTION_BUDGET,
          message: `A deep clean takes ${AI_SECTION_BUDGET} sections at a time. Select a range, or clean it in passes.`,
        },
        { status: 400 }
      );
    }

    const window = monthWindow();
    const quota  = await consume(
      "cleanup_month", user.id, ent.limits.advancedCleanupMonthly, window
    );

    if (!quota.allowed) {
      // Den avsedda saljpunkten: de har precis sett vad stadningen gor,
      // och rakningen tog slut. Inget hanglas i vagen innan dess.
      return NextResponse.json(
        {
          error:    "cleanup_allowance_spent",
          used:     quota.used,
          limit:    quota.limit,
          resetsAt: quota.resetsAt.toISOString(),
          message:  `You have used your ${quota.limit} free deep cleans this month. Pro includes unlimited cleanup, plus the advanced memorisation tools.`,
        },
        { status: 402 }
      );
    }

    const joined = sections
      .map(s => `[${s.id}] ${s.content}`)
      .join("\n\n---\n\n")
      .slice(0, AI_CHAR_BUDGET);

    const instructions =
      typeof body.instructions === "string" ? body.instructions.slice(0, 500) : "";

    try {
      const result = await runAi<{ sections: CleanedSection[]; notes: string[] }>({
        userId: user.id,
        ent,
        feature: "text_cleanup",
        cacheInput: { workId: id, ids: sections.map(s => s.id), instructions },
        build: () => ({
          system: SYSTEM_PROMPT,
          prompt:
            `Work: ${work.title} — ${work.author}\n` +
            (instructions ? `The reader asks: ${instructions}\n` : "") +
            `\n${asDocument(joined)}`,
          maxTokens: 8_000,
        }),
        parse: raw => {
          const parsed = parseJsonBlock<{ sections?: unknown; notes?: unknown }>(raw);
          if (!parsed || !Array.isArray(parsed.sections)) return null;

          // En modell kan hitta pa ett id. Bara sektioner vi faktiskt
          // skickade in far skrivas tillbaka — annars vore det en vag att
          // skriva over godtyckliga rader.
          const known = new Set(sections.map(s => s.id));
          const out = (parsed.sections as CleanedSection[])
            .filter(x => x && typeof x.id === "string" && known.has(x.id))
            .filter(x => typeof x.content === "string" && x.content.trim().length > 0)
            .map(x => ({ id: x.id, content: String(x.content) }));

          return {
            sections: out,
            notes: Array.isArray(parsed.notes) ? parsed.notes.map(String).slice(0, 8) : [],
          };
        },
      });

      if (apply) await writeBack(result.data.sections);

      return NextResponse.json({
        mode:      "advanced",
        applied:   apply,
        changed:   result.data.sections.length,
        notes:     result.data.notes,
        cached:    result.cached,
        remaining: Number.isFinite(quota.remaining) ? quota.remaining : null,
        preview:   apply ? [] : result.data.sections.slice(0, 8),
      });
    } catch (err) {
      // Gick anropet sonder ska ransonen inte vara forbrukad.
      await release("cleanup_month", user.id, window).catch(() => {});
      throw err;
    }
  } catch (err) {
    return toResponse(err);
  }
}

/** Hur mycket som ar kvar av ransonen, sa att UI:t kan visa det. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { user, ent } = await session();

    const owns = await prisma.work.findFirst({
      where: { id, userId: user.id }, select: { id: true },
    });
    if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const limit = ent.limits.advancedCleanupMonthly;
    const unlimited = !Number.isFinite(limit) || limit >= Number.MAX_SAFE_INTEGER;
    const used  = await peek("cleanup_month", user.id, monthWindow());

    return NextResponse.json({
      basic:     canUseFeature(ent, FEATURE.BASIC_CLEANUP),
      advanced:  canUseFeature(ent, FEATURE.ADVANCED_CLEANUP),
      used,
      limit:     unlimited ? null : limit,
      remaining: unlimited ? null : Math.max(0, limit - used),
    });
  } catch (err) {
    return toResponse(err);
  }
}

async function writeBack(sections: CleanedSection[]): Promise<void> {
  if (!sections.length) return;
  await prisma.$transaction(
    sections.map(s =>
      prisma.section.update({ where: { id: s.id }, data: { content: s.content } })
    )
  );
}
