// lib/meter.ts
// Versmått att recitera till.
//
// Ett versmått beskrivs här som ett taktmönster: hur många slag en rad
// har, vilka av dem som är betonade, och hur många rader som hör ihop.
// Det räcker för att slå takten till nästan all klassisk vers.
//
// En anmärkning om terziner: terza rima är ett RIMSCHEMA (aba bcb cdc),
// inte ett versmått. Dantes rader är hendekasyllabiska — elva stavelser
// med obligatorisk betoning på den tionde. Det är den takten man slår.
// Grupperingen om tre rader är däremot verklig och värd att höra.

export interface Meter {
  id:          string;
  name:        string;
  origin:      string;
  description: string;

  /** Huvudslag per rad — versfötterna eller de betonade stavelserna. */
  beatsPerLine: number;

  /** Svaga klick mellan huvudslagen. 0 = bara huvudslag. */
  subdivisions: number;

  /** Vilka huvudslag som är starka. Längden ska matcha beatsPerLine. */
  accents: boolean[];

  /** Rader per strof. 3 för terzin, 4 för balladstrof, 1 för löpande vers. */
  linesPerGroup: number;

  /** Rimligt utgångstempo i huvudslag per minut. */
  defaultBpm: number;

  /** Exempelrad, för att höra hur det ska låta. */
  example?: string;
}

export const METERS: Meter[] = [
  {
    id:     "hexameter",
    name:   "Dactylic hexameter",
    origin: "Homer, Virgil, Ovid",
    description:
      "Six feet to the line. Each foot opens on a long syllable — that stroke is the ictus, and it is what the rhapsode kept time to. The sixth foot always closes short.",
    beatsPerLine:  6,
    subdivisions:  2,
    accents:       [true, false, false, false, false, true],
    linesPerGroup: 1,
    defaultBpm:    104,
    example:       "Mē-nin ā-ei-de, the-ā, Pē-lē-i-a-deō A-chi-lē-os",
  },
  {
    id:     "hendecasyllable",
    name:   "Hendecasyllable · terzina",
    origin: "Dante, Petrarch",
    description:
      "Eleven syllables, the tenth always stressed, gathered in threes. The three-line group is the terzina — Dante's rhyme carries forward from the middle line of each one to the next.",
    beatsPerLine:  11,
    subdivisions:  0,
    accents:       [false, false, false, true, false, true, false, false, false, true, false],
    linesPerGroup: 3,
    defaultBpm:    150,
    example:       "Nel mez-zo del cam-min di no-stra vi-ta",
  },
  {
    id:     "pentameter",
    name:   "Iambic pentameter",
    origin: "Shakespeare, Milton",
    description:
      "Five rising feet — light then heavy, five times over. The spine of English verse, and close enough to ordinary speech that it hides in plain sight.",
    beatsPerLine:  10,
    subdivisions:  0,
    accents:       [false, true, false, true, false, true, false, true, false, true],
    linesPerGroup: 1,
    defaultBpm:    160,
    example:       "Shall I com-PARE thee TO a SUM-mer's DAY?",
  },
  {
    id:     "elegiac",
    name:   "Elegiac couplet",
    origin: "Ovid, Propertius",
    description:
      "A hexameter answered by a shorter line. The second line breaks in the middle and falls away — the shape of lament.",
    beatsPerLine:  6,
    subdivisions:  2,
    accents:       [true, false, false, true, false, false],
    linesPerGroup: 2,
    defaultBpm:    100,
  },
  {
    id:     "ballad",
    name:   "Ballad metre",
    origin: "Folk song, hymnody, Coleridge",
    description:
      "Four stresses, then three, alternating. Carried more verse through more centuries than any written form, because it is built to be sung.",
    beatsPerLine:  4,
    subdivisions:  1,
    accents:       [true, false, true, false],
    linesPerGroup: 4,
    defaultBpm:    92,
  },
  {
    id:     "fornyrdislag",
    name:   "Fornyrðislag",
    origin: "The Poetic Edda",
    description:
      "Two stresses to a half-line, bound across the break by alliteration rather than rhyme. The Norse answer to the same problem: how to hold a poem without writing it down.",
    beatsPerLine:  4,
    subdivisions:  0,
    accents:       [true, false, true, false],
    linesPerGroup: 4,
    defaultBpm:    84,
  },
  {
    id:     "alexandrine",
    name:   "Alexandrine",
    origin: "Racine, Swedish classical verse",
    description:
      "Twelve syllables with a hinge at the middle. The pause after the sixth is not optional — it is the form.",
    beatsPerLine:  12,
    subdivisions:  0,
    accents:       [false, true, false, true, false, true, false, true, false, true, false, true],
    linesPerGroup: 2,
    defaultBpm:    170,
  },
  {
    id:     "free",
    name:   "Plain time",
    origin: "Any text",
    description:
      "No pattern imposed. A steady pulse to keep you from rushing, which is the commonest fault in recitation.",
    beatsPerLine:  4,
    subdivisions:  0,
    accents:       [true, false, false, false],
    linesPerGroup: 1,
    defaultBpm:    72,
  },
];

export function getMeter(id: string): Meter {
  return METERS.find(m => m.id === id) ?? METERS[METERS.length - 1];
}

/**
 * Föreslår ett versmått utifrån verkets typ och radernas längd.
 * En kvalificerad gissning — användaren kan alltid byta.
 */
export function suggestMeter(workType: string, text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return "free";

  const avgSyll =
    lines.slice(0, 40).reduce((sum, l) => sum + countSyllables(l), 0) /
    Math.min(lines.length, 40);

  // Tre rader i taget med tomrad emellan pekar mot terzin
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  const threes = blocks.filter(b => b.trim().split("\n").length === 3).length;
  if (blocks.length >= 3 && threes / blocks.length > 0.6) return "hendecasyllable";

  if (workType === "EPIC" && avgSyll > 13) return "hexameter";
  if (workType === "PLAY" || workType === "POEM") {
    if (avgSyll >= 9  && avgSyll <= 11) return "pentameter";
    if (avgSyll >= 11 && avgSyll <= 13) return "hendecasyllable";
    if (avgSyll <= 8)                   return "ballad";
  }
  if (avgSyll > 14) return "hexameter";

  return "free";
}

/** Grov stavelseräkning — vokalgrupper. Räcker för att gissa versmått. */
export function countSyllables(line: string): number {
  const groups = line
    .toLowerCase()
    .replace(/[^a-zàâäæçéèêëïîôöœùûüÿåäö\s]/g, "")
    .match(/[aeiouyàâäæéèêëïîôöœùûüÿåä]+/g);
  return groups ? groups.length : 0;
}

/** Sekunder per rad vid ett givet tempo. */
export function secondsPerLine(meter: Meter, bpm: number): number {
  return (meter.beatsPerLine * 60) / bpm;
}
