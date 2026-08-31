// app/api/practice/grade/route.ts
//
// Rättning av ett försök.
//
// Det här var appens dyraste vana. Varje gång någon skrev av en strof
// gick originalet och försöket till en språkmodell för att få ett tal
// mellan noll och hundra tillbaka — en jämförelse mellan två ordföljder,
// alltså exakt det en dator gör bäst och en modell gör dyrast. Med en
// text som Odysséen och några passiva användare blir det tusentals anrop
// i månaden för aritmetik.
//
// Nu räknas poängen, diffen och de missade orden ut i lib/cue.ts med
// Levenshtein på ordnivå. Det är gratis, tar en millisekund, och ger
// samma svar varje gång — vilket dessutom är ett krav för att
// mästerskapsnivån ska gå att lita på.
//
// Modellen finns kvar, men högre upp: den sätter aldrig betyget, den
// läser det. Vad gled, varför, och vad man gör åt det till nästa gång.
// Det är den delen som är Pro, och det är också den enda delen där en
// modell faktiskt tillför något.

import { NextRequest, NextResponse } from "next/server";
import { session, rateLimit, toResponse } from "@/lib/http/guard";
import { prisma } from "@/lib/db";
import { gradeAttempt, scoreToQuality, type CueLevel } from "@/lib/cue";
import { canUseFeature } from "@/lib/billing/entitlements";
import { FEATURE } from "@/lib/billing/plans";
import { runAi } from "@/lib/ai/run";
import { asDocument, parseJsonBlock, UNTRUSTED_INPUT_RULE } from "@/lib/anthropic";
import { accuracyPercent } from "@/lib/mastery";
import { duelEntitlementsForSection } from "@/lib/duels";

const CUES: CueLevel[] = ["full", "firstWord", "initials", "skeleton", "hidden"];

interface Analysis {
  summary:  string;
  patterns: string[];
  drill:    string;
}

export async function POST(req: NextRequest) {
  try {
    const { user, ent: planEnt } = await session();

    const limited = await rateLimit(`grade:${user.id}`, 40);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const sectionId = typeof body.sectionId === "string" ? body.sectionId : "";
    const attempt   = typeof body.attempt   === "string" ? body.attempt   : "";
    const cue: CueLevel = CUES.includes(body.cueLevel) ? body.cueLevel : "hidden";

    if (!sectionId) return NextResponse.json({ error: "Missing sectionId" }, { status: 400 });
    if (!attempt.trim()) return NextResponse.json({ error: "Nothing to mark" }, { status: 400 });

    // Ägarskap. Texten hämtas på servern — klienten skickar aldrig in
    // originalet, för då skulle den kunna skicka in något lättare.
    const section = await prisma.section.findFirst({
      where:  { id: sectionId, work: { userId: user.id } },
      select: { id: true, name: true, content: true, work: { select: { title: true, author: true } } },
    });
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Star sektionens verk i en pagaende tvekamp galler kampens
    // behorigheter, inte kontots. Bada sidor far samma redskap sa lange
    // klockan gar — se lib/duels.ts. Utanfor en kamp ar detta samma
    // objekt som session() gav, och kostar en fraga som aldrig stalls.
    const ent = await duelEntitlementsForSection(user.id, planEnt, section.id);

    // ── Det deterministiska lagret. Gäller alla, kostar ingenting. ────
    const graded  = gradeAttempt(section.content, attempt);
    const quality = scoreToQuality(graded.score, cue);
    const total   = graded.diff.length;
    const correct = graded.diff.filter(d => d.correct).length;

    const result = {
      score:    graded.score,
      diff:     graded.diff,
      missed:   graded.missed,
      quality,
      accuracy: accuracyPercent(correct, total),
      wordsTotal:   total,
      wordsCorrect: correct,
      analysis:     null as Analysis | null,
      analysisAvailable: canUseFeature(ent, FEATURE.ADVANCED_RECITATION),
    };

    // ── Lagret ovanpå. Endast Pro, och aldrig avgörande. ─────────────
    if (result.analysisAvailable) {
      try {
        const ai = await runAi<Analysis>({
          userId: user.id,
          ent,
          feature: "recitation_analysis",
          cacheInput: {
            // Samma text och samma sorts miss ger samma råd. Försöket
            // självt ingår inte i nyckeln — annars vore varje anrop unikt
            // och cachen meningslös.
            section: section.id,
            missed:  graded.missed,
            band:    Math.floor(graded.score / 10),
            cue,
          },
          build: () => ({
            system:
              "You coach people who are committing literature to memory. " +
              "The attempt has ALREADY been scored word by word; the score is " +
              "not yours to set or dispute. Explain what the pattern of errors " +
              "suggests and what to do about it. Be concrete and unsentimental. " +
              "No praise, no exclamation marks.\n\n" +
              UNTRUSTED_INPUT_RULE +
              '\n\nReturn ONLY JSON: {"summary":"one or two sentences",' +
              '"patterns":["short observation"],"drill":"one concrete thing to try next"}',
            prompt:
              `Work: ${section.work.title} — ${section.work.author}\n` +
              `Section: ${section.name}\n` +
              `Score: ${graded.score}/100 with cue level "${cue}"\n` +
              `Words slipped: ${graded.missed.join(", ") || "none"}\n\n` +
              asDocument(section.content),
            maxTokens: 600,
          }),
          parse: raw => {
            const parsed = parseJsonBlock<Analysis>(raw);
            if (!parsed?.summary) return null;
            return {
              summary:  String(parsed.summary),
              patterns: Array.isArray(parsed.patterns) ? parsed.patterns.map(String).slice(0, 4) : [],
              drill:    String(parsed.drill ?? ""),
            };
          },
          // Slut kvot eller ett trasigt anrop får inte hindra rättningen.
          // Poängen är redan uträknad; analysen är grädden.
          fallback: () => ({ summary: "", patterns: [], drill: "" }),
        });

        if (ai.data.summary) result.analysis = ai.data;
      } catch {
        // Tyst. Användaren har fått sin rättning.
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return toResponse(err);
  }
}
