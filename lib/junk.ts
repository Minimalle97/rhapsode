// lib/junk.ts
// Känner igen sektioner som troligen inte hör till verket.
//
// En inskannad utgåva innehåller mer än texten: titelsida, copyright,
// förord från utgivaren, textkritiska noter, ordförklaringar, register.
// Allt det hamnar i importen och ser vid första anblicken ut som vilken
// sektion som helst.
//
// Det här är gissningar, inte domar. Träffarna markeras i gränssnittet så
// att de går att hitta snabbt — men ingenting tas bort automatiskt. En
// felaktig gissning som raderar en strof ur Dante är värre än trettio
// sektioner du får slänga för hand.

export type JunkReason =
  | "front-matter"
  | "editorial"
  | "reference"
  | "fragment"
  | "numbers";

export interface JunkFlag {
  isLikelyJunk: boolean;
  reason:       JunkReason | null;
  label:        string;
}

const PATTERNS: { reason: JunkReason; label: string; re: RegExp }[] = [
  {
    reason: "front-matter",
    label:  "Front matter",
    re: /\b(copyright|all rights reserved|isbn|first published|printed in|library of congress|cataloguing|typeset|reprinted|edition published)\b/i,
  },
  {
    reason: "front-matter",
    label:  "Front matter",
    re: /\b(table of contents|contents|acknowledg(e)?ments|about the (editor|author|series)|from the director|foreword|preface|dedication)\b/i,
  },
  {
    reason: "editorial",
    label:  "Editorial",
    re: /\b(textual note|editorial|this edition|the present text|emendation|quarto|folio|apparatus|collation|variant reading|modern spelling)\b/i,
  },
  {
    reason: "editorial",
    label:  "Editorial",
    re: /\b(introduction to the play|a modern perspective|further reading|reading list|bibliograph|works cited|appendix)\b/i,
  },
  {
    reason: "reference",
    label:  "Reference",
    re: /\b(index|glossary|footnote|see also|cf\.|op\. cit\.|ibid)\b/i,
  },
];

/** Andel tecken som är siffror eller skiljetecken snarare än bokstäver. */
function symbolRatio(text: string): number {
  const total   = text.replace(/\s/g, "").length;
  if (total === 0) return 1;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return 1 - letters / total;
}

export function flagJunk(content: string, name: string): JunkFlag {
  const text  = content.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const probe = `${name} ${text.slice(0, 600)}`;

  // Nästan tomt
  if (words.length < 4) {
    return { isLikelyJunk: true, reason: "fragment", label: "Fragment" };
  }

  // Mest siffror och tecken — radnummer, sidhuvuden, tabeller
  if (symbolRatio(text) > 0.35 && words.length < 60) {
    return { isLikelyJunk: true, reason: "numbers", label: "Numbers" };
  }

  for (const p of PATTERNS) {
    if (p.re.test(probe)) {
      return { isLikelyJunk: true, reason: p.reason, label: p.label };
    }
  }

  return { isLikelyJunk: false, reason: null, label: "" };
}

/**
 * Gissar var själva verket börjar: första sektionen efter vilken det
 * följer en obruten svit av rena sektioner. Att kräva en svit gör att en
 * enstaka ren rad mitt i förordet inte lurar den.
 */
export function guessFirstRealSection(
  sections: { id: string; name: string; content: string }[],
  runLength = 4
): string | null {
  let cleanRun = 0;
  let runStart: string | null = null;

  for (const s of sections) {
    if (flagJunk(s.content, s.name).isLikelyJunk) {
      cleanRun = 0;
      runStart = null;
    } else {
      if (cleanRun === 0) runStart = s.id;
      cleanRun += 1;
      if (cleanRun >= runLength) return runStart;
    }
  }
  return null;
}
