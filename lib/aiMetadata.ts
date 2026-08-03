// lib/aiMetadata.ts
// Metadata för ett uppladdat verk.
//
// Skillnad mot lib/anthropic.ts → aiAnalyze():
// aiAnalyze bad modellen dela upp texten OCH skriva av den ordagrant.
// Det fungerar för korta stycken men är fel verktyg för ett helt verk —
// dels ryms det inte, dels är risken att texten ändras oacceptabel i en
// app där den ska kunnas utantill.
//
// Här får modellen bara ett smakprov och svarar med metadata. Texten
// rör den aldrig.

import { callClaude } from "./anthropic";

export interface WorkMetadata {
  title:          string;
  author:         string;
  type:           string;
  difficulty:     "easy" | "medium" | "hard";
  estimatedMinutes: number;
  tags:           string[];
  analysis:       string;
  practiceAdvice: string;
}

const VALID_TYPES = [
  "POEM", "EPIC", "PLAY", "SPEECH",
  "PHILOSOPHICAL", "RELIGIOUS", "PROFESSIONAL", "OTHER",
];

/**
 * Bygger ett representativt smakprov: början, en bit från mitten och slutet.
 * Räcker gott för att bedöma verk, ton och svårighet.
 */
function sample(text: string, budget = 4000): string {
  if (text.length <= budget) return text;

  const part  = Math.floor(budget / 3);
  const start = text.slice(0, part);
  const mid   = text.slice(
    Math.floor(text.length / 2) - part / 2,
    Math.floor(text.length / 2) + part / 2
  );
  const end   = text.slice(-part);

  return `${start}\n\n[...]\n\n${mid}\n\n[...]\n\n${end}`;
}

export async function aiWorkMetadata(
  text: string,
  sectionCount: number,
  hints: { title?: string; author?: string; filename?: string } = {},
  lang = "en"
): Promise<WorkMetadata> {
  const langNote =
    lang !== "en"
      ? `Write analysis and practiceAdvice in ${lang === "sv" ? "Swedish" : lang}. Keep JSON keys and all other values in English.`
      : "";

  const system = `You are a literary scholar cataloguing works for Rhapsode, a memorisation app.

You will receive an excerpt from a work. Return ONLY valid JSON, no markdown fences:
{"title":"","author":"","type":"POEM|EPIC|PLAY|SPEECH|PHILOSOPHICAL|RELIGIOUS|PROFESSIONAL|OTHER","difficulty":"easy|medium|hard","estimatedMinutes":number,"tags":["lowercase-tag"],"analysis":"2-3 sentences","practiceAdvice":"one concrete memorisation technique suited to this specific text"}

Rules:
- Identify the real title and author if you recognise the work. If not, infer a sensible title from the opening and use "Unknown" as author.
- difficulty reflects how hard it is to memorise: archaic language, irregular metre and abstract argument make it harder.
- estimatedMinutes is total time to commit the whole work to memory, across all sessions. It has ${sectionCount} sections.
- 2-5 tags: period, form, language, theme.
- Do NOT reproduce or rewrite the text itself.
${langNote}`;

  const hintLine = [
    hints.title    ? `User-provided title: ${hints.title}`   : "",
    hints.author   ? `User-provided author: ${hints.author}` : "",
    hints.filename ? `Filename: ${hints.filename}`           : "",
  ].filter(Boolean).join("\n");

  const raw = await callClaude(
    [{
      role: "user",
      content: `${hintLine ? hintLine + "\n\n" : ""}Excerpt:\n\n${sample(text)}`,
    }],
    { system, maxTokens: 700 }
  );

  return parseMetadata(raw, sectionCount, hints);
}

function parseMetadata(
  raw: string,
  sectionCount: number,
  hints: { title?: string; author?: string; filename?: string }
): WorkMetadata {
  let parsed: Partial<WorkMetadata> = {};

  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    // Plocka ut det yttersta JSON-objektet ifall modellen lagt till text runt
    const start = cleaned.indexOf("{");
    const end   = cleaned.lastIndexOf("}");
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    // Faller igenom till standardvärdena nedan
  }

  const fallbackTitle =
    hints.title ||
    hints.filename?.replace(/\.(pdf|txt|md)$/i, "").replace(/[-_]+/g, " ") ||
    "Untitled work";

  const type = String(parsed.type ?? "").toUpperCase();

  return {
    title:  hints.title  || parsed.title  || fallbackTitle,
    author: hints.author || parsed.author || "Unknown",
    type:   VALID_TYPES.includes(type) ? type : "OTHER",
    difficulty: (["easy", "medium", "hard"] as const).includes(
      parsed.difficulty as "easy" | "medium" | "hard"
    )
      ? (parsed.difficulty as "easy" | "medium" | "hard")
      : "medium",
    estimatedMinutes:
      Number.isFinite(parsed.estimatedMinutes) && parsed.estimatedMinutes! > 0
        ? Math.round(parsed.estimatedMinutes!)
        : Math.max(10, sectionCount * 8),
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.slice(0, 6).map(t => String(t).toLowerCase().trim()).filter(Boolean)
      : [],
    analysis:       parsed.analysis       || "",
    practiceAdvice: parsed.practiceAdvice || "Read the section aloud three times, then recite it with the text hidden.",
  };
}
