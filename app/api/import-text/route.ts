// app/api/import-text/route.ts
//
// POST /api/import-text
//   multipart/form-data → file (pdf/txt/md) + valfria title, author, targetWords
//   application/json    → { text, title?, author?, targetWords? }
//
// Flöde:
//   extrahera text → dela i delar och sektioner (i kod) →
//   ett AI-anrop för metadata → skriv till databasen i satser

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractTextFromFile, cleanText, MAX_CHARS } from "@/lib/extract";
import { segmentWork } from "@/lib/segment";
import { aiWorkMetadata } from "@/lib/aiMetadata";

export const runtime     = "nodejs";
export const maxDuration = 60;

// Säkerhetstak — Divina Commedia hamnar kring 4 700 sektioner,
// så det här är högt satt med marginal.
const MAX_SECTIONS = 12_000;
const BATCH        = 1_000;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const contentType = req.headers.get("content-type") ?? "";

    let text        = "";
    let title       = "";
    let author      = "";
    let filename    = "";
    let targetWords = 60;
    let pageCount: number | null = null;
    let truncated   = false;

    // ── Läs indata ────────────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const extracted = await extractTextFromFile(file);
      text      = extracted.text;
      pageCount = extracted.pageCount;
      truncated = extracted.truncated;
      filename  = file.name;

      title       = String(form.get("title")  ?? "").trim();
      author      = String(form.get("author") ?? "").trim();
      targetWords = clampWords(form.get("targetWords"));
    } else {
      const body    = await req.json();
      const rawText = String(body.text ?? "");
      if (!rawText.trim()) {
        return NextResponse.json({ error: "No text provided" }, { status: 400 });
      }

      truncated   = rawText.length > MAX_CHARS;
      text        = cleanText(truncated ? rawText.slice(0, MAX_CHARS) : rawText);
      title       = String(body.title  ?? "").trim();
      author      = String(body.author ?? "").trim();
      targetWords = clampWords(body.targetWords);
    }

    // ── Dela upp ──────────────────────────────────────────────────
    const seg = segmentWork(text, { targetWords });

    if (seg.sectionCount === 0) {
      return NextResponse.json(
        { error: "Could not find any text to split into sections." },
        { status: 400 }
      );
    }

    if (seg.sectionCount > MAX_SECTIONS) {
      return NextResponse.json(
        {
          error: `That would create ${seg.sectionCount.toLocaleString()} sections, past the ${MAX_SECTIONS.toLocaleString()} limit. Choose a longer section length, or upload the work one part at a time.`,
        },
        { status: 400 }
      );
    }

    // ── Metadata (verket skapas även om AI:n failar) ───────────────
    let meta;
    try {
      meta = await aiWorkMetadata(text, seg.sectionCount, { title, author, filename });
    } catch (err) {
      console.error("Metadata lookup failed, using fallbacks:", err);
      meta = {
        title:  title  || filename.replace(/\.(pdf|txt|md)$/i, "") || "Untitled work",
        author: author || "Unknown",
        type:   "OTHER",
        difficulty: "medium" as const,
        estimatedMinutes: Math.max(10, seg.sectionCount * 6),
        tags: [] as string[],
        analysis: "",
        practiceAdvice:
          "Read the section aloud, then recite it with the text hidden.",
      };
    }

    // ── Skriv till databasen ──────────────────────────────────────
    const work = await prisma.work.create({
      data: {
        userId:           user.id,
        title:            meta.title,
        author:           meta.author,
        type:             meta.type,
        tags:             meta.tags,
        analysis:         meta.analysis || null,
        practiceAdvice:   meta.practiceAdvice || null,
        difficulty:       meta.difficulty,
        estimatedMinutes: meta.estimatedMinutes,
      },
      select: { id: true, title: true, author: true },
    });

    let globalIndex = 0;
    const sectionRows: {
      workId: string;
      partId: string | null;
      name: string;
      content: string;
      difficulty: string;
      orderIndex: number;
    }[] = [];

    if (seg.flat) {
      // Inga delar — sektionerna hänger direkt på verket
      for (const s of seg.parts[0].sections) {
        sectionRows.push({
          workId:     work.id,
          partId:     null,
          name:       s.name,
          content:    s.content,
          difficulty: meta.difficulty,
          orderIndex: globalIndex++,
        });
      }
    } else {
      // Skapa delarna först och få tillbaka deras id:n
      const createdParts = await prisma.part.createManyAndReturn({
        data: seg.parts.map((p, i) => ({
          workId:     work.id,
          name:       p.name || `Part ${i + 1}`,
          orderIndex: i,
        })),
        select: { id: true, orderIndex: true },
      });

      const byIndex = new Map(createdParts.map(p => [p.orderIndex, p.id]));

      seg.parts.forEach((part, pi) => {
        const partId = byIndex.get(pi) ?? null;
        for (const s of part.sections) {
          sectionRows.push({
            workId:     work.id,
            partId,
            name:       s.name,
            content:    s.content,
            difficulty: meta.difficulty,
            orderIndex: globalIndex++,
          });
        }
      });
    }

    // Satsvis insättning — ett enda statement med 5 000 rader
    // riskerar att slå i gränser hos databasen.
    for (let i = 0; i < sectionRows.length; i += BATCH) {
      await prisma.section.createMany({
        data: sectionRows.slice(i, i + BATCH),
      });
    }

    return NextResponse.json(
      {
        work,
        partCount:    seg.flat ? 0 : seg.parts.length,
        sectionCount: seg.sectionCount,
        wordCount:    text.trim().split(/\s+/).length,
        pageCount,
        truncated,
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Import failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function clampWords(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 60;
  return Math.min(300, Math.max(20, Math.round(n)));
}
