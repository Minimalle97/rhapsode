// app/api/agents/chat/route.ts
// POST /api/agents/chat → Scholar eller Coach-konversation

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { aiChat } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    await requireUser();

    const { messages, mode, workTitle, lang } = await req.json();

    if (!messages?.length || !mode || !workTitle) {
      return NextResponse.json({ error: "Missing messages, mode, or workTitle" }, { status: 400 });
    }

    if (mode !== "scholar" && mode !== "coach") {
      return NextResponse.json({ error: "mode must be 'scholar' or 'coach'" }, { status: 400 });
    }

    const reply = await aiChat(messages, mode, workTitle, lang ?? "en");
    return NextResponse.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
