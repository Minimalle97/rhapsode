// app/api/agents/analyze/route.ts
// POST /api/agents/analyze → AI-analys av text, returnerar sektioner + metadata

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { aiAnalyze } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const { title, author, type, text, lang } = await req.json();

    if (!title || !text) {
      return NextResponse.json({ error: "Missing title or text" }, { status: 400 });
    }

    const result = await aiAnalyze(title, author ?? "", type ?? "OTHER", text, lang ?? "en");
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
