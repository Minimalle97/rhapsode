// lib/extract.ts
// Plockar ut ren text ur en uppladdad fil. Stöder .pdf, .txt, .md
//
// Städningen är utökad. En inskannad utgåva bär med sig sådant som inte
// hör till verket: sidhuvuden som upprepas på varje sida, radnummer i
// marginalen, fotnoter, sidnummer. Allt det såg tidigare ut som text och
// hamnade mitt i strofer.
//
// Ingenting som kan vara verkets egna ord tas bort. Vid tvekan står det
// kvar — det är enklare att stryka en rad för hand än att upptäcka att
// en vers försvann.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_CHARS        = 2_000_000;

export interface ExtractResult {
  text:      string;
  pageCount: number | null;
  truncated: boolean;
  /** Vad städningen tog bort, för att kunna berätta det. */
  removed:   { headers: number; lineNumbers: number; pageNumbers: number };
}

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than 25 MB.");
  }

  const name  = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isTxt =
    file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md");

  let raw: string;
  let pageCount: number | null = null;

  if (isPdf) {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf    = await getDocumentProxy(buffer);
    const result = await extractText(pdf, { mergePages: true });

    raw       = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
    pageCount = result.totalPages ?? null;
  } else if (isTxt) {
    raw = await file.text();
  } else {
    throw new Error("Upload a PDF, TXT or MD file.");
  }

  const { text: cleaned, removed } = cleanTextVerbose(raw, isPdf);
  const truncated = cleaned.length > MAX_CHARS;

  if (!cleaned.trim()) {
    throw new Error(
      "No text found in that file. Scanned PDFs without a text layer can't be read."
    );
  }

  return {
    text: truncated ? cleaned.slice(0, MAX_CHARS) : cleaned,
    pageCount,
    truncated,
    removed,
  };
}

/** Enkel version — behålls för importer som klistrar in text. */
export function cleanText(input: string): string {
  return cleanTextVerbose(input, false).text;
}

export function cleanTextVerbose(
  input: string,
  aggressive: boolean
): { text: string; removed: ExtractResult["removed"] } {
  const removed = { headers: 0, lineNumbers: 0, pageNumbers: 0 };

  let text = input
    .replace(/\r\n?/g, "\n")
    // Avstavning över radbrytning: "memo-\nrera" → "memorera"
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    // Sidbrytningar
    .replace(/\f/g, "\n\n");

  let lines = text.split("\n").map(l => l.replace(/[ \t]+$/g, ""));

  if (aggressive) {
    // ── Återkommande sidhuvuden och sidfötter ────────────────────
    // En rad som förekommer många gånger i ett långt dokument är nästan
    // aldrig verkets text. Kravet på minst fem förekomster gör att en
    // omkvädesrad i en ballad klarar sig.
    const counts = new Map<string, number>();
    for (const l of lines) {
      const key = l.trim();
      if (key.length >= 3 && key.length <= 70) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    const threshold = Math.max(5, Math.floor(lines.length / 400));
    const repeated = new Set(
      [...counts.entries()]
        .filter(([key, n]) => n >= threshold && !/[.!?;:,]$/.test(key))
        .map(([key]) => key)
    );

    if (repeated.size) {
      const before = lines.length;
      lines = lines.filter(l => !repeated.has(l.trim()));
      removed.headers = before - lines.length;
    }

    // ── Radnummer i marginalen ───────────────────────────────────
    // Utgåvor numrerar var femte rad. Numret hamnar antingen ensamt på
    // en rad eller klistrat i slutet av versraden.
    const beforeNums = lines.length;
    lines = lines.filter(l => !/^\s*\d{1,4}\s*$/.test(l));
    removed.lineNumbers = beforeNums - lines.length;

    lines = lines.map(l => {
      const m = l.match(/^(.*\p{L}["'’)\]]?[.,;:!?]?)\s{2,}(\d{1,4})\s*$/u);
      if (m) {
        removed.lineNumbers += 1;
        return m[1];
      }
      return l;
    });

    // ── Sidnummer av typen "— 42 —" ───────────────────────────────
    const beforePages = lines.length;
    lines = lines.filter(l => !/^\s*[—–-]{0,2}\s*\d{1,4}\s*[—–-]{0,2}\s*$/.test(l));
    removed.pageNumbers = beforePages - lines.length;
  }

  text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { text, removed };
}
