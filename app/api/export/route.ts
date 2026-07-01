// app/api/export/route.ts
// GET /api/export
// Returnerar ett komplett JSON-backup av alla användarens verk + progress.
// Kan laddas ned som .json-fil av klienten.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { RhapsodeExport } from "@/types/export";

export async function GET() {
  try {
    const user = await requireUser();

    const works = await prisma.work.findMany({
      where:   { userId: user.id },
      include: { sections: { orderBy: { orderIndex: "asc" } } },
      orderBy: { createdAt: "asc" },
    });

    const payload: RhapsodeExport = {
      version:    "1.0",
      exportedAt: new Date().toISOString(),
      user: {
        username: user.username,
      },
      works: works.map(w => ({
        title:           w.title,
        author:          w.author,
        type:            w.type as import("@/types").WorkType,
        tags:            w.tags,
        analysis:        w.analysis,
        practiceAdvice:  w.practiceAdvice,
        difficulty:      w.difficulty as "easy" | "medium" | "hard",
        estimatedMinutes: w.estimatedMinutes,
        createdAt:       w.createdAt.toISOString(),
        sections: w.sections.map(s => ({
          name:        s.name,
          content:     s.content,
          difficulty:  s.difficulty,
          status:      s.status as import("@/types").SectionStatus,
          orderIndex:  s.orderIndex,
          sm2Reps:     s.sm2Reps,
          sm2EF:       s.sm2EF,
          sm2Interval: s.sm2Interval,
          nextReview:  s.nextReview?.toISOString() ?? null,
        })),
      })),
    };

    // Sätt Content-Disposition så att webbläsaren laddar ned filen
    const filename = `rhapsode-backup-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type":        "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
