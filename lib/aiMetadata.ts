// lib/aiMetadata.ts
// Metadata för ett uppladdat verk: titel, författare, typ, svårighet, taggar.
//
// Modellen ser ett smakprov och rör aldrig texten. I en app där texten
// ska kunnas utantill är risken att den skrivs om oacceptabel.
//
// Ändrat i den här omgången:
//
//   Går genom runAi(), så anropet syns i bokföringen och lyder under
//   kostnadstaket.
//
//   Cachen delas. Två personer som laddar upp samma Gutenberg-fil av
//   Odysséen ställer identiska frågor — nyckeln räknas ur textens
//   innehåll, inte ur vem som frågar, och det andra anropet blir gratis.
//
//   Räknas INTE mot månadskvoten. Katalogisering är något appen gör åt
//   användaren, inte något de bett om, och att låta en import äta en av
//   fem generationer vore att ta betalt för fel sak. Går kvoten eller
//   budgeten ändå åt går importen igenom med gissad titel.

import { createHash } from "crypto";
import { asDocument, parseJsonBlock, UNTRUSTED_INPUT_RULE } from "./anthropic";
import { runAi } from "./ai/run";
import type { Entitlements } from "./billing/entitlements";

export interface WorkMetadata {
  title:            string;
  author:           string;
  type:             string;
  difficulty:       "easy" | "medium" | "hard";
  estimatedMinutes: number;
  tags:             string[];
  analysis:         string;
  practiceAdvice:   string;
}

const VALID_TYPES = [
  "POEM", "EPIC", "PLAY", "SPEECH",
  "PHILOSOPHICAL", "RELIGIOUS", "PROFESSIONAL", "OTHER",
];

/**
 * Början, en bit ur mitten, slutet. Räcker för att bedöma verk och ton,
 * och håller nere indata till en bråkdel av ett stort verk.
 */
function sample(text: string, budget = 4_000): string {
  if (text.length <= budget) return text;
  const part = Math.floor(budget / 3);
  const mid  = Math.floor(text.length / 2);
  return [
    text.slice(0, part),
    text.slice(mid - part / 2, mid + part / 2),
    text.slice(-part),
  ].join("\n\n[...]\n\n");
}

export interface MetadataRequest {
  userId: string;
  ent:    Entitlements;
  text:   string;
  sectionCount: number;
  hints?: { title?: string; author?: string; filename?: string };
}

export async function aiWorkMetadata(req: MetadataRequest): Promise<WorkMetadata> {
  const hints = req.hints ?? {};
  const excerpt = sample(req.text);

  const fallback = (): WorkMetadata => ({
    title:
      hints.title ||
      hints.filename?.replace(/\.(pdf|txt|md)$/i, "").replace(/[-_]+/g, " ") ||
      "Untitled work",
    author:           hints.author || "Unknown",
    type:             "OTHER",
    difficulty:       "medium",
    estimatedMinutes: Math.max(10, req.sectionCount * 8),
    tags:             [],
    analysis:         "",
    practiceAdvice:   "Read the section aloud, then recite it with the text hidden.",
  });

  const result = await runAi<WorkMetadata>({
    userId: req.userId,
    ent:    req.ent,
    feature: "work_metadata",
    // Innehållet avgör svaret, alltså hashen av utdraget. Användaren
    // ingår inte — det är det som gör raden delbar.
    cacheInput: {
      excerpt: createHash("sha256").update(excerpt).digest("hex"),
      sections: req.sectionCount,
      title:  hints.title  ?? null,
      author: hints.author ?? null,
    },
    build: () => ({
      system:
        "You are a literary scholar cataloguing works for Rhapsode, a memorisation app.\n\n" +
        UNTRUSTED_INPUT_RULE +
        "\n\nReturn ONLY valid JSON, no markdown fences:\n" +
        '{"title":"","author":"","type":"POEM|EPIC|PLAY|SPEECH|PHILOSOPHICAL|RELIGIOUS|PROFESSIONAL|OTHER",' +
        '"difficulty":"easy|medium|hard","estimatedMinutes":number,"tags":["lowercase-tag"],' +
        '"analysis":"2-3 sentences","practiceAdvice":"one concrete technique suited to this text"}\n\n' +
        "Rules:\n" +
        "- Name the real title and author if you recognise the work. If not, infer a sensible title from the opening and use \"Unknown\".\n" +
        "- difficulty is how hard this is to MEMORISE: archaic diction, irregular metre and abstract argument make it harder.\n" +
        `- estimatedMinutes is total time to commit the whole work to memory. It has ${req.sectionCount} sections.\n` +
        "- 2-5 tags: period, form, language, theme.\n" +
        "- Do NOT reproduce or rewrite the text.",
      prompt:
        [
          hints.title    ? `User-provided title: ${hints.title}`   : "",
          hints.author   ? `User-provided author: ${hints.author}` : "",
          hints.filename ? `Filename: ${hints.filename}`           : "",
        ].filter(Boolean).join("\n") +
        "\n\n" + asDocument(excerpt),
      maxTokens: 700,
    }),
    parse: raw => {
      const parsed = parseJsonBlock<Partial<WorkMetadata>>(raw);
      if (!parsed) return null;

      const type = String(parsed.type ?? "").toUpperCase();
      const difficulty = parsed.difficulty;

      return {
        // Användarens egna uppgifter vinner alltid över gissningen.
        title:  hints.title  || parsed.title  || fallback().title,
        author: hints.author || parsed.author || "Unknown",
        type:   VALID_TYPES.includes(type) ? type : "OTHER",
        difficulty:
          difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
            ? difficulty
            : "medium",
        estimatedMinutes:
          typeof parsed.estimatedMinutes === "number" && parsed.estimatedMinutes > 0
            ? Math.round(parsed.estimatedMinutes)
            : Math.max(10, req.sectionCount * 8),
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.slice(0, 6).map(t => String(t).toLowerCase().trim()).filter(Boolean)
          : [],
        analysis:       String(parsed.analysis ?? ""),
        practiceAdvice: String(parsed.practiceAdvice ?? "") ||
          "Read the section aloud three times, then recite it with the text hidden.",
      };
    },
    fallback,
  });

  return result.data;
}
