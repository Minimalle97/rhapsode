// lib/drills/skeleton.ts
//
// Skelettet: texten nedskuren till sina begynnelsebokstaver.
//
//   Tell m– o– t–– m––, M–––
//
// Ren rakning, inga anrop, ingen databas. Det ar med flit: skelettet
// ritas om vid varje andrad installning, och en funktion som bara raknar
// gar att prova ord for ord — vilket ar precis vad som behovs, for
// felen i den har sortens kod ar alltid ett tecken hit eller dit.
//
// ── Vad som bevaras ───────────────────────────────────────────────────
//
// Skiljetecken, versaler och radbrytningar star kvar exakt. Texten ska ga
// att kanna igen som sin egen; det enda som forsvinner ar bokstaverna.
//
// Ett ord ar bokstaver och siffror, plus bindestreck och apostrofer INUTI
// ordet. "well-worn" ar ett ord, inte tva. "wasn't" ar ett ord, inte tva.
// Bada delas i de flesta enkla losningar, och bada blir obegripliga nar
// de delas: "w––– t" sager ingenting om "wasn't".

/** En bit av en rad: antingen text som star kvar, eller ett nedskuret ord. */
export type Segment =
  | { kind: "literal"; text: string }
  /**
   * Ett ord. `shown` ar bokstaverna som star kvar, `hidden` ar strecken.
   *
   * `word` ar ordet som det faktiskt star i texten. Det behovs for Peek:
   * den ska kunna ta fram ETT ord i klartext, och ur en bokstav plus tre
   * streck gar originalet inte att fa tillbaka.
   */
  | { kind: "word"; shown: string; hidden: string; word: string };

export interface SkeletonSettings {
  /** Hur manga begynnelsebokstaver som star kvar. 1, 2 eller 3. */
  lettersPerWord: 1 | 2 | 3;
  /** Hur manga ord i borjan av raden som star helt oforandrade. 0, 1 eller 2. */
  wholeWordsPerLine: 0 | 1 | 2;
  /**
   * Pa: strecken ar lika manga som de dolda tecknen, sa ordets langd syns.
   * Av: alltid tre streck, sa langden avslojar ingenting.
   */
  showWordLength: boolean;
  /** Pa: ord pa hogst tre tecken (the, of, and, in) star kvar hela. */
  keepShortWords: boolean;
}

export const DEFAULT_SETTINGS: SkeletonSettings = {
  lettersPerWord:    1,
  wholeWordsPerLine: 0,
  showWordLength:    true,
  keepShortWords:    false,
};

/** Strecket. En tankestreck (en dash), inte ett bindestreck. */
const DASH = "–";

/** Ord pa hogst sa har manga tecken raknas som korta. */
const SHORT_WORD_MAX = 3;

/** Nar langden doljs visas alltid sa har manga streck. */
const FIXED_DASHES = 3;

/**
 * Ett ord: bokstaver och siffror, med bindestreck och apostrofer inuti.
 *
 * Apostrofen tacker bade ' och ’ — den senare ar den som ordbehandlare
 * satter in av sig sjalva, och en text klistrad fran Word ar full av dem.
 */
const WORD = /[\p{L}\p{N}]+(?:['’‐‑-][\p{L}\p{N}]+)*/gu;

/**
 * Skar ned ett enskilt ord.
 *
 * Exporterad for att den gar att prova ensam — det ar har alla
 * gransfallen bor, och de ar lattare att lasa som en rad prov an som en
 * rad exempel i en kommentar.
 */
export function reduceWord(word: string, settings: SkeletonSettings): { shown: string; hidden: string } {
  const keepWhole = { shown: word, hidden: "" };

  // Korta ord star kvar hela nar den installningen ar pa.
  if (settings.keepShortWords && word.length <= SHORT_WORD_MAX) return keepWhole;

  // Ar ordet inte langre an vad som anda skulle visas finns inget att dolja.
  if (word.length <= settings.lettersPerWord) return keepWhole;

  const shown  = word.slice(0, settings.lettersPerWord);
  const hidden = settings.showWordLength
    ? word.length - settings.lettersPerWord
    : FIXED_DASHES;

  return { shown, hidden: DASH.repeat(hidden) };
}

/**
 * En rad, uppdelad i bitar.
 *
 * Allt som INTE ar ett ord — mellanrum, komma, tankstreck mellan ord,
 * citattecken — kommer tillbaka som `literal` och ritas ut orort.
 */
export function skeletonLine(line: string, settings: SkeletonSettings): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  let wordsSoFar = 0;

  // exec i en loop kraver att lastIndex nollstalls — regexen ar global och
  // delas mellan anrop.
  WORD.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = WORD.exec(line)) !== null) {
    if (match.index > at) {
      out.push({ kind: "literal", text: line.slice(at, match.index) });
    }

    const word = match[0];
    // De forsta orden pa raden star kvar hela, om det ar instalt sa.
    const spared = wordsSoFar < settings.wholeWordsPerLine;
    const piece  = spared ? { shown: word, hidden: "" } : reduceWord(word, settings);

    out.push({ kind: "word", ...piece, word });

    wordsSoFar += 1;
    at = match.index + word.length;
  }

  if (at < line.length) out.push({ kind: "literal", text: line.slice(at) });
  return out;
}

/** Hela texten, rad for rad. Tomma rader kommer tillbaka som tomma listor. */
export function skeletonLines(text: string, settings: SkeletonSettings): Segment[][] {
  return text.split("\n").map(line => skeletonLine(line, settings));
}

/** Raderna som ren text. Anvands av proven och av kopiera-till-urklipp. */
export function skeletonText(text: string, settings: SkeletonSettings): string {
  return skeletonLines(text, settings)
    .map(segs => segs.map(s => (s.kind === "literal" ? s.text : s.shown + s.hidden)).join(""))
    .join("\n");
}

// ── Instalningarnas granser ───────────────────────────────────────────

/**
 * Vad som kan komma in: vad som helst.
 *
 * Falten ar `unknown` med flit. Instalningarna kommer bade fran databasen
 * och fran ett JSON-anrop, och en typ som lovar `1 | 2 | 3` om nagot som
 * i sjalva verket ar en strang fran ett formular ar ett lofte som inte
 * halls. cleanSettings ar stallet dar loftet blir sant.
 */
export interface RawSettings {
  lettersPerWord?:    unknown;
  wholeWordsPerLine?: unknown;
  showWordLength?:    unknown;
  keepShortWords?:    unknown;
}

/**
 * Tvingar in ett sparat varde i det tillatna.
 *
 * Instalningarna kommer fran databasen och kan i princip innehalla vad
 * som helst — en gammal rad, ett handredigerat falt. Ett `lettersPerWord`
 * pa noll hade gett en text helt utan bokstaver, och ett pa tjugo hade
 * gett texten oforandrad. Bada ser ut som att funktionen ar trasig.
 */
export function cleanSettings(raw: RawSettings | null | undefined): SkeletonSettings {
  const letters = Number(raw?.lettersPerWord);
  const whole   = Number(raw?.wholeWordsPerLine);

  return {
    lettersPerWord:    (letters === 2 || letters === 3 ? letters : 1) as 1 | 2 | 3,
    wholeWordsPerLine: (whole === 1 || whole === 2 ? whole : 0) as 0 | 1 | 2,
    showWordLength:    raw?.showWordLength !== false,
    keepShortWords:    raw?.keepShortWords === true,
  };
}
