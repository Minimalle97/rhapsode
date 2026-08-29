// app/api/agents/chat/route.ts
// POST → en fråga till läsaren eller tränaren om ett verk.
//
// Ändrat: routen var tidigare en oskyddad genomgång till Claude. Den
// kontrollerade inloggning men varken plan, kvot eller takt, vilket
// gjorde den till appens dyraste öppna dörr — ett skript kunde hålla den
// igång hur länge som helst. Nu går den genom runAi() som allt annat.

import { NextRequest, NextResponse } from "next/server";
import { session, toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { runAi } from "@/lib/ai/run";
import { asDocument, UNTRUSTED_INPUT_RULE } from "@/lib/anthropic";

const MAX_TURNS = 12;
const MAX_CHARS = 2_000;

export async function POST(req: NextRequest) {
  try {
    const { user, ent } = await session();

    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode === "coach" ? "coach" : "scholar";
    const workId = typeof body.workId === "string" ? body.workId : "";
    const question = typeof body.question === "string" ? body.question.slice(0, MAX_CHARS) : "";

    if (!workId || !question.trim()) {
      return NextResponse.json({ error: "Missing workId or question" }, { status: 400 });
    }

    // Verket måste vara användarens. Utan den kontrollen vore det här ett
    // sätt att läsa titlar ur andras bibliotek.
    const work = await prisma.work.findFirst({
      where:  { id: workId, userId: user.id },
      select: { title: true, author: true, type: true },
    });
    if (!work) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const history: { role: "user" | "assistant"; content: string }[] =
      Array.isArray(body.history) ? body.history.slice(-MAX_TURNS) : [];

    const result = await runAi<{ reply: string }>({
      userId: user.id,
      ent,
      feature: "tutor_chat",
      cacheInput: { workId, mode, question, turns: history.length },
      build: () => ({
        system:
          mode === "scholar"
            ? `You are a literary scholar helping someone read "${work.title}" by ${work.author} closely. Be precise and illuminating. Never use exclamation marks.`
            : `You are a memory coach. The person is committing "${work.title}" by ${work.author} to memory. Be calm and practical, and reason from spaced repetition where it helps. Never use exclamation marks.`,
        prompt:
          history.map(t => `${t.role === "user" ? "Q" : "A"}: ${t.content}`).join("\n\n") +
          (history.length ? "\n\n" : "") +
          `${UNTRUSTED_INPUT_RULE}\n\n` +
          asDocument(question, "TEXT"),
        maxTokens: 900,
      }),
      parse: raw => (raw.trim() ? { reply: raw.trim() } : null),
    });

    return NextResponse.json({ reply: result.data.reply, cached: result.cached });
  } catch (err) {
    return toResponse(err);
  }
}
