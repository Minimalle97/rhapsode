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
export interface GradeOptions {
  /**
   * Sant nar forsoket TALADES.
   *
   * Slar pa homofontolerans: "their" och "there" later exakt likadant, sa
   * en rostmotor som valjer fel av dem sager ingenting om minnet. Att
   * racka det som ett fel ar att straffa nagon for taligenkanningens
   * gissning.
   *
   * Av for skrivna forsok, dar stavningen ar en del av det man ovar och
   * "their" mot "there" ar ett riktigt fel.
   */
  spoken?: boolean;
}

/**
 * Ord som later likadant och som rostmotorer standigt blandar ihop.
 *
 * Varje rad pekar mot en gemensam form. Listan ar med flit KORT: den ska
 * tacka det som ar omojligt att hora skillnad pa, inte det som bara ar
 * likt. Ju fler par som viks ihop, desto fler riktiga fel slinker
 * igenom — och da ljuger poangen at andra hallet.
 */
const HOMOPHONES: Record<string, string> = {
  their: "there", "they're": "there", there: "there",
  to: "to", too: "to", two: "to",
  your: "your", "you're": "your",
  its: "its", "it's": "its",
  hear: "here", here: "here",
  for: "for", four: "for",
  one: "one", won: "one",
  no: "no", know: "no",
  through: "through", threw: "through",
  whole: "whole", hole: "whole",
  soul: "soul", sole: "soul",
  bear: "bear", bare: "bear",
  by: "by", buy: "by", bye: "by",
  // Formerna som verser anvander och motorn nastan alltid moderniserar.
  "o'er": "over", over: "over",
  "e'er": "ever", ever: "ever",
  "ne'er": "never", never: "never",
  "'tis": "tis", tis: "tis",
};

/** Siffror mot ord. "2" och "two" ar samma sak sagt hogt. */
const NUMBERS: Record<string, string> = {
  "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
};

function canonical(word: string, spoken: boolean): string {
  const n = NUMBERS[word] ?? word;
  if (!spoken) return n;
  return HOMOPHONES[n] ?? n;
}

export function gradeAttempt(
  original: string,
  attempt:  string,
  options:  GradeOptions = {}
): { score: number; diff: Diff[]; missed: string[] } {
  const spoken = options.spoken === true;

  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[–—]/g, "-")
      .replace(/[^\p{L}\p{N}'\-\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();

  // Orden som VISAS och rapporteras ar originalets egna. Kanonformen
  // anvands bara for att avgora om tva ord ar samma — annars skulle
  // "there" dyka upp i missade-listan for en text som sager "their".
  const origWords = norm(original).split(" ").filter(Boolean);
  const tryWords  = norm(attempt).split(" ").filter(Boolean);

  const origKeys = origWords.map(w => canonical(w, spoken));
  const tryKeys  = tryWords.map(w => canonical(w, spoken));

  if (origWords.length === 0) return { score: 0, diff: [], missed: [] };

  // Levenshtein på ordnivå, med spårning av vägen genom matrisen
  const n = origWords.length;
  const m = tryWords.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = origKeys[i - 1] === tryKeys[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }

  // Gå baklänges för att märka ut vilka ord som satt
  const diff: Diff[] = [];
  const missed: string[] = [];
  let i = n, j = m;

  while (i > 0) {
    if (j > 0 && origKeys[i - 1] === tryKeys[j - 1] && d[i][j] === d[i - 1][j - 1]) {
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

// ── Att valja bland motorns egna gissningar ───────────────────────────

/**
 * Bygger det basta transkriptet ur rostmotorns alternativ.
 *
 * ── Varfor ────────────────────────────────────────────────────────────
 *
 * Web Speech ger flera hypoteser per yttrande, men appen las tidigare
 * bara den forsta (`maxAlternatives` var aldrig satt, alltsa 1). Motorn
 * hade alltsa ofta ratt ord som andra- eller tredjeval, och vi kastade
 * bort det. Med en text vi REDAN KANNER ar det slosaktigt: vi kan fraga
 * vilken av motorns egna gissningar som stammer bast.
 *
 * ── Varfor det ar arligt ──────────────────────────────────────────────
 *
 * Ingenting hittas pa. Alla kandidater kommer fran motorn; vi valjer
 * bara vilken av dem som troligen var den avsedda. Det ar samma sak som
 * en manniska gor nar hon hor otydligt och tolkar utifran sammanhang.
 *
 * Vad som INTE gors: ord som motorn aldrig foreslog laggs aldrig till.
 * Sade nagon fel ord blir det fortfarande fel — det finns ingen
 * kandidat med det ratta ordet att valja.
 *
 * ── Hur ────────────────────────────────────────────────────────────────
 *
 * Girigt, bit for bit. Man borjar med motorns forstahandsval rakt av och
 * provar sedan varje alternativ pa varje bit; det som hojer poangen far
 * sta kvar. En bit ar en mening eller fras, sa antalet kombinationer ar
 * litet och rakningen billig.
 */
export function pickBestTranscript(
  original: string,
  chunks:   string[][],
  options:  GradeOptions = {}
): string {
  if (chunks.length === 0) return "";

  // Motorns forstahandsval, precis som forut. Utgangslaget.
  const chosen = chunks.map(alts => alts[0] ?? "");

  const scoreOf = (parts: string[]) =>
    gradeAttempt(original, parts.join(" "), options).score;

  let best = scoreOf(chosen);

  for (let i = 0; i < chunks.length; i++) {
    const alternatives = chunks[i];
    if (!alternatives || alternatives.length < 2) continue;

    for (let a = 1; a < alternatives.length; a++) {
      const trial = chosen.slice();
      trial[i] = alternatives[a];

      const score = scoreOf(trial);
      if (score > best) {
        best = score;
        chosen[i] = alternatives[a];
      }
    }
  }

  return chosen.join(" ").replace(/\s+/g, " ").trim();
}
