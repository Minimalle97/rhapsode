// lib/cue.ts
// Stödnivåer mellan att se texten och att inte se den alls.
//
// Steget som saknades: förstabokstavsmetoden.
//
//   Shall I compare thee to a summer's day?
//   S____ I c______ t___ t_ a s______'s d__?
//
// Det är den mest beprövade ställningen i verbal memorering. Tillräckligt
// stöd för att du ska ta dig igenom raden, tillräckligt lite för att
// hjärnan måste hämta orden själv. Utan mellansteget hoppar man från
// lätt till omöjligt, och lär sig mindre av båda.
//
// Interpunktion och radbrytningar bevaras alltid — de bär rytmen, och
// utan dem försvinner versens form.

export type CueLevel = "full" | "firstWord" | "initials" | "skeleton" | "hidden";

export const CUE_LEVELS: {
  id:    CueLevel;
  label: string;
  hint:  string;
}[] = [
  { id: "full",      label: "Read",     hint: "The text as written" },
  { id: "firstWord", label: "Openings", hint: "First word of each line" },
  { id: "initials",  label: "Initials", hint: "First letter of every word" },
  { id: "skeleton",  label: "Shape",    hint: "Punctuation and line breaks only" },
  { id: "hidden",    label: "From memory", hint: "Nothing at all" },
];

const BLANK = "_";

/**
 * Ersätter alla tecken utom det första i varje ord med understreck.
 * Skiljetecken, apostrofer och bindestreck står kvar.
 */
export function maskToInitials(text: string): string {
  return text.replace(/\p{L}[\p{L}\p{M}']*/gu, word => {
    if (word.length <= 1) return word;
    // Behåll apostrofer inuti: "summer's" → "s______'s"
    return word[0] + word.slice(1).replace(/\p{L}/gu, BLANK);
  });
}

/** Behåller första ordet på varje rad, maskerar resten till understreck. */
export function maskToFirstWord(text: string): string {
  return text
    .split("\n")
    .map(line => {
      const m = line.match(/^(\s*)(\p{L}[\p{L}\p{M}']*)(.*)$/u);
      if (!m) return line;
      const [, indent, first, rest] = m;
      return indent + first + rest.replace(/\p{L}/gu, BLANK);
    })
    .join("\n");
}

/** Bara skiljetecken, radlängd och radbrytningar. Formen utan orden. */
export function maskToSkeleton(text: string): string {
  return text.replace(/\p{L}/gu, BLANK);
}

export function applyCue(text: string, level: CueLevel): string {
  switch (level) {
    case "full":      return text;
    case "firstWord": return maskToFirstWord(text);
    case "initials":  return maskToInitials(text);
    case "skeleton":  return maskToSkeleton(text);
    case "hidden":    return "";
  }
}

/**
 * Föreslår stödnivå utifrån hur väl sektionen sitter.
 * Ju stabilare minne, desto mindre stöd ska erbjudas.
 */
export function suggestCue(status: string): CueLevel {
  switch (status) {
    case "not_started": return "full";
    case "learning":    return "firstWord";
    case "learned":     return "initials";
    case "stable":      return "skeleton";
    default:            return "hidden";
  }
}

// ── Rättning ──────────────────────────────────────────────────────────

export interface Diff {
  word:    string;
  correct: boolean;
  /**
   * Vilket ord i FORSOKET som hamnade har, eller null nar originalets ord
   * inte motsvarades av nagot alls (en ren utelamning).
   *
   * Tillagt for tvekan: hooken vet vid vilka ord i forsoket det blev tyst
   * lange, men de raknas i forsokets ordfoljd. Utan den har bryggan gar
   * de inte att lagga pa ratt stalle i originalet, och en tvekan hade
   * hamnat pa fel rad — vilket vore samre an att inte visa den alls.
   */
  at?:     number | null;
}

/**
 * Jämför ett försök mot originalet, ord för ord.
 *
 * Normaliserar bort skiljetecken, versaler och den sortens typografiska
 * variation som inte är minnesfel: kursivt apostrof mot rakt, tankstreck
 * mot bindestreck. Att skriva "dont" istället för "don't" är inte att ha
 * glömt texten.
 */
export function gradeAttempt(
  original: string,
  attempt:  string
): { score: number; diff: Diff[]; missed: string[] } {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/[^\p{L}\p{N}'\-\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  const origWords = norm(original).split(" ").filter(Boolean);
  const tryWords  = norm(attempt).split(" ").filter(Boolean);

  if (origWords.length === 0) return { score: 0, diff: [], missed: [] };

  // Levenshtein på ordnivå, med spårning av vägen genom matrisen
  const n = origWords.length;
  const m = tryWords.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = origWords[i - 1] === tryWords[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }

  // Gå baklänges för att märka ut vilka ord som satt
  const diff: Diff[] = [];
  const missed: string[] = [];
  let i = n, j = m;

  while (i > 0) {
    if (j > 0 && origWords[i - 1] === tryWords[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      diff.unshift({ word: origWords[i - 1], correct: true, at: j - 1 });
      i--; j--;
    } else if (j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      // Ett ord sades, men fel ord. Platsen i forsoket ar kand.
      diff.unshift({ word: origWords[i - 1], correct: false, at: j - 1 });
      missed.push(origWords[i - 1]);
      i--; j--;
    } else if (d[i][j] === d[i - 1][j] + 1) {
      // Ordet hoppades over helt. Det finns ingen plats i forsoket.
      diff.unshift({ word: origWords[i - 1], correct: false, at: null });
      missed.push(origWords[i - 1]);
      i--;
    } else {
      j--;
    }
  }

  const distance = d[n][m];
  const score = Math.max(0, Math.round(((n - distance) / n) * 100));

  return { score, diff, missed: missed.slice(0, 8) };
}

/** SM-2-kvalitet 0–5 utifrån hur väl försöket gick. */
export function scoreToQuality(score: number, usedCue: CueLevel): number {
  // Stöd sänker taket — att klara det med hela texten framför sig
  // är inte samma sak som att klara det ur minnet.
  const ceiling: Record<CueLevel, number> = {
    full: 3, firstWord: 4, initials: 4, skeleton: 5, hidden: 5,
  };

  let q: number;
  if (score >= 98)      q = 5;
  else if (score >= 90) q = 4;
  else if (score >= 75) q = 3;
  else if (score >= 50) q = 2;
  else if (score >= 25) q = 1;
  else                  q = 0;

  return Math.min(q, ceiling[usedCue]);
}
