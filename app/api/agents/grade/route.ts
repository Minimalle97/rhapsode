// app/api/agents/grade/route.ts
// POST /api/agents/grade → betygsätt ett skrivförsök mot originaltexten

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { aiGrade } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const { original, attempt, lang } = await req.json();

    if (!original || !attempt) {
      return NextResponse.json({ error: "Missing original or attempt" }, { status: 400 });
    }

    const result = await aiGrade(original, attempt, lang ?? "en");
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
