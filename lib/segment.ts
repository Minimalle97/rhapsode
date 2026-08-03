// lib/segment.ts
// Delar upp ett verk i DELAR och SEKTIONER.
//
// Texten klipps isär i kod, aldrig av en språkmodell — varje tecken
// bevaras exakt som i originalet. Det är hela poängen i en app där
// texten ska kunnas utantill.
//
// Två nivåer:
//   Del      — sångerna i Divina Commedia, böckerna i Odysséen,
//              scenerna i Coriolanus. Verkets egen indelning.
//   Sektion  — det man faktiskt övar på åt gången. Några rader.

export interface Section {
  name:    string;
  content: string;
}

export interface Part {
  name:     string;
  sections: Section[];
}

export interface SegmentResult {
  parts:        Part[];
  sectionCount: number;
  /** true om verket saknar egen indelning och ligger platt */
  flat:         boolean;
}

export interface SegmentOptions {
  /** Ungefärligt antal ord per sektion. Standard 60. */
  targetWords?: number;
  /** Hårt tak per sektion. */
  maxWords?: number;
  /** Om verket saknar rubriker: hur många sektioner per automatisk del. */
  sectionsPerAutoPart?: number;
}

// ── Rubrikmönster, ordnade efter nivå ────────────────────────────────
// Lägre rank = grövre indelning.
interface HeadingRule {
  rank: number;
  re:   RegExp;
}

const HEADING_RULES: HeadingRule[] = [
  // Nivå 1 — verkets största delar
  { rank: 1, re: /^\s*(VOLUME|BOOK|PART|CANTICA|TESTAMENT|DEL|BOK)\s+([IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE)\b.*$/i },
  { rank: 1, re: /^\s*(INFERNO|PURGATORIO|PARADISO|ILIAD|ODYSSEY)\s*$/i },

  // Nivå 2 — kapitel, sånger, akter
  { rank: 2, re: /^\s*(CANTO|CHAPTER|ACT|SÅNG|KAPITEL|AKT|SONNET|PSALM|HYMN|ODE|ELEGY|LETTER|EPISTLE)\s+([IVXLCDM]+|\d+).*$/i },

  // Nivå 3 — scener, strofer, avsnitt
  { rank: 3, re: /^\s*(SCENE|STANZA|SECTION|SCEN|STROF|AVSNITT|FYTT|PROLOGUE|EPILOGUE|PROLOG|EPILOG)\b.*$/i },

  // Nivå 4 — ensamma nummer på egen rad
  { rank: 4, re: /^\s*([IVXLCDM]{1,7})\.?\s*$/ },
  { rank: 4, re: /^\s*(\d{1,4})\.?\s*$/ },
  { rank: 4, re: /^\s*§\s*\d+.*$/ },
];

interface FoundHeading {
  line:  number;
  rank:  number;
  title: string;
}

function matchHeading(line: string): { rank: number; title: string } | null {
  const t = line.trim();
  if (!t || t.length > 90) return null;

  for (const rule of HEADING_RULES) {
    if (rule.re.test(t)) {
      return { rank: rule.rank, title: tidyHeading(t) };
    }
  }
  return null;
}

function tidyHeading(s: string): string {
  const cleaned = s.trim().replace(/[.:]$/, "").replace(/\s+/g, " ");
  // ALLA VERSALER blir Kapitäler för läsbarhet: "CANTO I" → "Canto I"
  if (cleaned === cleaned.toUpperCase() && /[A-ZÅÄÖ]/.test(cleaned)) {
    return cleaned
      .toLowerCase()
      .replace(/\b([a-zåäö])/g, (_, c: string) => c.toUpperCase())
      // romerska siffror ska förbli versala
      .replace(/\b([ivxlcdm]+)\b/gi, m =>
        /^[ivxlcdm]+$/i.test(m) && m.length <= 7 ? m.toUpperCase() : m
      );
  }
  return cleaned;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function looksLikeVerse(text: string): boolean {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 6) return false;
  const shortRatio = lines.filter(l => l.trim().length < 60).length / lines.length;
  const avgWords   = lines.reduce((s, l) => s + wordCount(l), 0) / lines.length;
  return shortRatio > 0.7 && avgWords < 12;
}

// ── Huvudfunktion ────────────────────────────────────────────────────
export function segmentWork(
  text: string,
  options: SegmentOptions = {}
): SegmentResult {
  const targetWords = options.targetWords ?? 60;
  const maxWords    = options.maxWords ?? Math.round(targetWords * 2.2);
  const perAutoPart = options.sectionsPerAutoPart ?? 25;

  const lines    = text.split("\n");
  const headings = findHeadings(lines);

  // ── Inga rubriker alls ────────────────────────────────────────────
  if (headings.length === 0) {
    const sections = buildSections(text, targetWords, maxWords);

    // Kort verk — ingen anledning att dela upp
    if (sections.length <= perAutoPart * 1.5) {
      return {
        parts: [{ name: "", sections }],
        sectionCount: sections.length,
        flat: true,
      };
    }

    // Långt verk utan struktur — gruppera så listan går att arbeta i
    const parts: Part[] = [];
    for (let i = 0; i < sections.length; i += perAutoPart) {
      parts.push({
        name:     `Part ${roman(parts.length + 1)}`,
        sections: sections.slice(i, i + perAutoPart),
      });
    }
    return { parts, sectionCount: sections.length, flat: false };
  }

  // ── Välj vilken rubriknivå som blir DEL ───────────────────────────
  // Finaste nivån som förekommer minst två gånger. Grövre nivåer blir
  // prefix i namnet: "Act 1 · Scene 2", "Inferno · Canto I".
  const counts = new Map<number, number>();
  for (const h of headings) counts.set(h.rank, (counts.get(h.rank) ?? 0) + 1);

  const partRank = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([rank]) => rank)
    .sort((a, b) => b - a)[0] ?? headings[0].rank;

  // ── Bygg delarna ──────────────────────────────────────────────────
  const parts: Part[] = [];
  const prefixes = new Map<number, string>();

  let currentName: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (!body) return;

    const name = currentName ?? "Opening";
    const sections = buildSections(body, targetWords, maxWords);
    if (sections.length) parts.push({ name, sections });
  };

  let li = 0;
  for (const line of lines) {
    const h = headings.find(x => x.line === li);
    li += 1;

    if (!h) {
      buffer.push(line);
      continue;
    }

    if (h.rank < partRank) {
      // Grövre rubrik — spara som prefix, och stäng av pågående del
      flush();
      prefixes.set(h.rank, h.title);
      // Rensa finare prefix som inte längre gäller
      for (const r of [...prefixes.keys()]) if (r > h.rank) prefixes.delete(r);
      currentName = null;
    } else if (h.rank === partRank) {
      flush();
      const prefix = [...prefixes.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v)
        .join(" · ");
      currentName = prefix ? `${prefix} · ${h.title}` : h.title;
    } else {
      // Finare rubrik än delnivån — behåll den i texten som en rubrikrad
      buffer.push(line);
    }
  }
  flush();

  const sectionCount = parts.reduce((n, p) => n + p.sections.length, 0);

  // Bara en del blev det — ingen egentlig struktur
  if (parts.length <= 1) {
    return {
      parts: [{ name: "", sections: parts[0]?.sections ?? [] }],
      sectionCount,
      flat: true,
    };
  }

  return { parts, sectionCount, flat: false };
}

function findHeadings(lines: string[]): FoundHeading[] {
  const out: FoundHeading[] = [];
  lines.forEach((line, i) => {
    const m = matchHeading(line);
    if (m) out.push({ line: i, rank: m.rank, title: m.title });
  });
  return out;
}

// ── Sektionsuppdelning inom en del ───────────────────────────────────
function buildSections(
  text: string,
  targetWords: number,
  maxWords: number
): Section[] {
  const pieces = splitByBlocks(text, targetWords, maxWords);
  return pieces.map((content, i) => ({
    name:    `${i + 1}`,
    content,
  }));
}

function splitByBlocks(
  text: string,
  targetWords: number,
  maxWords: number
): string[] {
  let blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 1) blocks = splitIntoSentences(text);

  const out: string[] = [];
  let current: string[] = [];
  let count = 0;

  for (const block of blocks) {
    const w = wordCount(block);

    if (w > maxWords) {
      if (current.length) {
        out.push(current.join("\n\n"));
        current = [];
        count = 0;
      }
      out.push(...packSentences(splitIntoSentences(block), targetWords, maxWords));
      continue;
    }

    if (count > 0 && count + w > maxWords) {
      out.push(current.join("\n\n"));
      current = [];
      count = 0;
    }

    current.push(block);
    count += w;

    if (count >= targetWords) {
      out.push(current.join("\n\n"));
      current = [];
      count = 0;
    }
  }

  if (current.length) out.push(current.join("\n\n"));
  return out.filter(s => s.trim());
}

function splitIntoSentences(text: string): string[] {
  const guarded = text.replace(
    /\b(Mr|Mrs|Ms|Dr|Prof|St|Sr|Jr|jfr|osv|dvs|bl\.a|t\.ex)\./gi,
    "$1<DOT>"
  );
  return guarded
    .split(/(?<=[.!?;])\s+(?=[A-ZÅÄÖ"'«"—])/)
    .map(s => s.replace(/<DOT>/g, ".").trim())
    .filter(Boolean);
}

function packSentences(
  sentences: string[],
  targetWords: number,
  maxWords: number
): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let count = 0;

  for (const s of sentences) {
    const w = wordCount(s);
    if (count > 0 && count + w > maxWords) {
      out.push(current.join(" "));
      current = [];
      count = 0;
    }
    current.push(s);
    count += w;
    if (count >= targetWords) {
      out.push(current.join(" "));
      current = [];
      count = 0;
    }
  }
  if (current.length) out.push(current.join(" "));
  return out;
}

// ── Romerska siffror ─────────────────────────────────────────────────
const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"],  [90, "XC"],  [50, "L"],  [40, "XL"],
  [10, "X"],   [9, "IX"],   [5, "V"],   [4, "IV"], [1, "I"],
];

export function roman(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  let out = "", rest = n;
  for (const [v, sym] of ROMAN) {
    while (rest >= v) { out += sym; rest -= v; }
  }
  return out;
}
