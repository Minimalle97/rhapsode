// lib/projection.ts
// Den långa bågen.
//
// XP och streaks mäter dagar och veckor. Divina Commedia tar år. Ingen
// siffra i appen sa något om det avståndet — och för ett verk av den
// storleken är det den enda siffran som betyder något.
//
// Beräkningen bygger på faktisk takt de senaste veckorna, inte på ett
// önsketänkt tempo. Går det långsamt ska det synas att det går långsamt.

export interface Projection {
  /** Sektioner bemästrade hittills. */
  mastered:      number;
  total:         number;
  /** Andel klar, 0–100. */
  percent:       number;
  /** Sektioner bemästrade per vecka, senaste månaden. */
  perWeek:       number;
  /** Veckor kvar i nuvarande takt. Null om takten är noll. */
  weeksLeft:     number | null;
  /** Ungefärligt slutdatum. Null om takten är noll. */
  finishDate:    Date | null;
  /** Formulerat för en människa. */
  phrase:        string;
  /** Om verket är litet nog att prognosen inte tillför något. */
  tooSmall:      boolean;
}

export interface ProjectionInput {
  total:    number;
  mastered: number;
  /** Datum då varje sektion nådde bemästrad — eller sessionsdatum som närmevärde. */
  recentMasteryDates: Date[];
  now?: Date;
}

const SMALL_WORK = 12;

export function project(input: ProjectionInput): Projection {
  const now      = input.now ?? new Date();
  const { total, mastered } = input;
  const percent  = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const tooSmall = total < SMALL_WORK;

  // Takt: bemästrade sektioner de senaste 28 dagarna
  const cutoff = new Date(now.getTime() - 28 * 86_400_000);
  const recent = input.recentMasteryDates.filter(d => new Date(d) >= cutoff);
  const perWeek = recent.length / 4;

  const remaining = total - mastered;

  if (remaining <= 0) {
    return {
      mastered, total, percent, perWeek,
      weeksLeft: 0, finishDate: null, tooSmall,
      phrase: "Held in full",
    };
  }

  if (perWeek <= 0) {
    return {
      mastered, total, percent, perWeek: 0,
      weeksLeft: null, finishDate: null, tooSmall,
      phrase: recent.length === 0 && mastered === 0
        ? "Not started"
        : "Nothing mastered this month",
    };
  }

  const weeksLeft  = remaining / perWeek;
  const finishDate = new Date(now.getTime() + weeksLeft * 7 * 86_400_000);

  return {
    mastered, total, percent, perWeek,
    weeksLeft, finishDate, tooSmall,
    phrase: phraseFor(weeksLeft, finishDate),
  };
}

function phraseFor(weeks: number, date: Date): string {
  if (weeks < 1)  return "Within the week";
  if (weeks < 4)  return `About ${Math.round(weeks)} weeks`;

  const months = weeks / 4.345;
  if (months < 12) {
    return `About ${Math.round(months)} months — around ${date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
  }

  const years = months / 12;
  const rounded = years < 2 ? years.toFixed(1) : Math.round(years).toString();
  return `About ${rounded} years — around ${date.getFullYear()}`;
}

/**
 * Takten som en mening, för verk där prognosen inte är meningsfull
 * men rörelsen ändå är värd att se.
 */
export function paceLine(perWeek: number): string {
  if (perWeek <= 0)   return "No sections mastered in the last month";
  if (perWeek < 1)    return `About ${Math.round(perWeek * 4)} a month`;
  if (perWeek < 2)    return "About one a week";
  return `About ${Math.round(perWeek)} a week`;
}
