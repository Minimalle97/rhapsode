// lib/anthropic.ts
// Server-side Anthropic-wrapper — körs BARA i Next.js route handlers (Node.js)

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude(
  messages: Message[],
  options: ClaudeOptions = {}
): Promise<string> {
  const { system, maxTokens = 1000 } = options;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY saknas i miljövariabler");

  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: maxTokens,
    messages,
  };
  if (system) body.system = system;

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) {
    // Bara felet loggas. Att skriva ut hela svaret vid varje anrop dränkte
    // loggen och la dessutom verkets text i klartext i serverloggen.
    console.error("Anthropic error:", JSON.stringify(data.error));
    throw new Error(data.error.message ?? JSON.stringify(data.error));
  }
  if (!res.ok) throw new Error(`Anthropic request failed (${res.status})`);
  return (
    data.content?.find((b: { type: string }) => b.type === "text")?.text ?? ""
  );
}

// ─── Specialiserade anrop ──────────────────────────────────────────

export async function aiAnalyze(
  title: string,
  author: string,
  type: string,
  text: string,
  lang = "en"
) {
  const langNote =
    lang !== "en"
      ? `Respond with analysis and practiceAdvice in ${lang === "sv" ? "Swedish" : lang}. Keep all JSON keys in English.`
      : "";

  const system = `You are a literary scholar for Rhapsode, a memorization app.
Analyze the text and return ONLY valid JSON (no markdown, no backticks):
{"difficulty":"easy|medium|hard","estimatedMinutes":number,"themes":["theme"],"analysis":"2-3 sentence scholarly analysis","practiceAdvice":"specific memorization tip","sections":[{"name":"Section name","content":"exact text"}]}
Split into 2-6 meaningful sections. Keep each section to 2-5 sentences. ${langNote}`;

  const raw = await callClaude(
    [{ role: "user", content: `Title: ${title}\nAuthor: ${author}\nType: ${type}\n\n${text.slice(0, 1500)}` }],
    { system }
  );

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      difficulty: "medium",
      estimatedMinutes: 15,
      themes: [],
      analysis: raw.slice(0, 200),
      practiceAdvice: "Read aloud daily.",
      sections: [{ name: "Section I", content: text }],
    };
  }
}

export async function aiGrade(
  original: string,
  attempt: string,
  lang = "en"
) {
  const langNote = lang !== "en" ? `Write feedback in ${lang === "sv" ? "Swedish" : lang}.` : "";
  const system = `Grade a memorization attempt. Return ONLY JSON: {"score":number,"feedback":"1-2 sentences","errors":["specific mistake"]}. Score 0-100. Be precise. ${langNote}`;

  const raw = await callClaude(
    [{ role: "user", content: `Original:\n"${original}"\n\nAttempt:\n"${attempt}"` }],
    { system }
  );

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return { score: 50, feedback: "Unable to evaluate.", errors: [] };
  }
}

export async function aiGenerateMedalTitle(
  workTitle: string,
  author: string
): Promise<string> {
  const raw = await callClaude(
    [{
      role: "user",
      content: `Generate a 4-6 word honorific title for someone who has memorized "${workTitle}" by ${author}. Style: archaic, dignified, classical. Examples: "Reciter of the Iliad", "Keeper of Hamlet's Words", "Bearer of the Aeneid". Return ONLY the title, nothing else.`,
    }],
    { maxTokens: 60 }
  );
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function aiChat(
  messages: Message[],
  mode: "scholar" | "coach",
  workTitle: string,
  lang = "en"
) {
  const langNote = lang !== "en" ? `Always respond in ${lang === "sv" ? "Swedish" : lang}.` : "";
  const system =
    mode === "scholar"
      ? `You are a literary scholar helping a student understand "${workTitle}". Be precise, illuminating, concise. Never use exclamation marks. ${langNote}`
      : `You are a memory coach for Rhapsode. The student is memorizing "${workTitle}". Be calm, practical, reference spaced repetition where useful. Never use exclamation marks. ${langNote}`;

  return callClaude(messages, { system });
}
