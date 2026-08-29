// app/api/import/route.ts
// POST /api/import
// Tar emot ett RhapsodeExport-JSON och skriver in verken i DB.
// Strategi: SKIP duplicates (samma title + author skippar import av det verket).
// Returnerar { imported, skipped, errors }.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { remainingWorkSlots } from "@/lib/billing/limits";
import { prisma } from "@/lib/db";
import type { RhapsodeExport, ExportWork } from "@/types/export";

interface ImportResult {
  imported: number;
  skipped:  number;
  errors:   string[];
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    let payload: RhapsodeExport;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Grundläggande validering
    if (payload.version !== "1.0" || !Array.isArray(payload.works)) {
      return NextResponse.json(
        { error: "Invalid export format. Expected version 1.0 with works array." },
        { status: 400 }
      );
    }

    // Hämta befintliga verk för duplicate-check
    const existing = await prisma.work.findMany({
      where:  { userId: user.id },
      select: { title: true, author: true },
    });
    const existingSet = new Set(existing.map(w => `${w.title}::${w.author}`));

    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

    // Free rymmer ett begränsat antal verk. En återställd säkerhetskopia
    // ska inte kunna gå runt taket bara för att den kommer i klump.
    const ent = await getEntitlements(user);
    let slots = await remainingWorkSlots(user.id, ent);

    for (const work of payload.works) {
      if (slots <= 0) {
        result.errors.push(`"${work.title}": no room left on your plan`);
        continue;
      }
      try {
        const before = result.imported;
        await importWork(user.id, work, existingSet, result);
        if (result.imported > before) slots -= 1;
      } catch (err) {
        result.errors.push(
          `"${work.title}": ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function importWork(
  userId:      string,
  work:        ExportWork,
  existingSet: Set<string>,
  result:      ImportResult
) {
  if (!work.title || !work.author || !Array.isArray(work.sections) || work.sections.length === 0) {
    result.errors.push(`"${work.title ?? "untitled"}": missing required fields`);
    return;
  }

  const key = `${work.title}::${work.author}`;
  if (existingSet.has(key)) {
    result.skipped++;
    return;
  }

  await prisma.work.create({
    data: {
      userId,
      title:           work.title,
      author:          work.author,
      type:            work.type ?? "OTHER",
      tags:            work.tags ?? [],
      analysis:        work.analysis ?? null,
      practiceAdvice:  work.practiceAdvice ?? null,
      difficulty:      work.difficulty ?? "medium",
      estimatedMinutes: work.estimatedMinutes ?? 15,
      sections: {
        create: work.sections.map((s, i) => ({
          name:        s.name,
          content:     s.content,
          difficulty:  s.difficulty ?? "medium",
          status:      s.status ?? "not_started",
          orderIndex:  s.orderIndex ?? i,
          sm2Reps:     s.sm2Reps  ?? 0,
          sm2EF:       s.sm2EF    ?? 2.5,
          sm2Interval: s.sm2Interval ?? 1,
          nextReview:  s.nextReview ? new Date(s.nextReview) : null,
        })),
      },
    },
  });

  existingSet.add(key);
  result.imported++;
}
