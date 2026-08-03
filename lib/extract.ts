// lib/extract.ts
// Plockar ut ren text ur en uppladdad fil. Stöder .pdf, .txt, .md
//
// Gränserna är satta för hela verk: Divina Commedia ligger kring
// 500 000 tecken, en Odyssé-översättning kring 700 000.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;  // 25 MB
export const MAX_CHARS        = 2_000_000;          // ~700 boksidor

export interface ExtractResult {
  text:      string;
  pageCount: number | null;
  truncated: boolean;
}

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("That file is larger than 25 MB.");
  }

  const name  = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isTxt =
    file.type.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md");

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

  const cleaned   = cleanText(raw);
  const truncated = cleaned.length > MAX_CHARS;

  if (!cleaned.trim()) {
    throw new Error(
      "No text found in that file. Scanned PDFs without a text layer can't be read."
    );
  }

  return {
    text:      truncated ? cleaned.slice(0, MAX_CHARS) : cleaned,
    pageCount,
    truncated,
  };
}

/**
 * Städar bort PDF-artefakter utan att röra orden — texten ska memoreras
 * ordagrant, så ingenting får skrivas om.
 */
export function cleanText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    // avstavning över radbrytning: "memo-\nrera" → "memorera"
    .replace(/(\p{L})-\n(\p{L})/gu, "$1$2")
    // sidnummer på egen rad
    .replace(/\n[ \t]*\d{1,4}[ \t]*\n/g, "\n\n")
    // sidbrytningar
    .replace(/\f/g, "\n\n")
    .split("\n")
    .map(l => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
