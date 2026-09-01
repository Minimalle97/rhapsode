// lib/repertoire/borders.ts
//
// En bard per grupp. Tjugofyra ringar att bara runt profilbilden.
//
// Rent utseende — ingen behorighet avgors har. Vem som far bara vad star
// i lib/repertoire.ts, och den fragan stalls pa servern.
//
// ── Varfor de ar data och inte tjugofyra SVG-filer ────────────────────
//
// En ring bestar av tva farger, en vinkel och ett tecken. Det racker for
// att gora dem sarskiljbara pa 38 pixlar, vilket ar den storlek de oftast
// ses i — i en vanlista, bredvid ett inlagg. Tjugofyra handritade filer
// hade gett marginellt mer pa profilsidan och betydligt mindre overallt
// annars, och de hade varit tjugofyra filer att halla i takt.
//
// Fargerna ar valda efter gruppen, inte slumpade: brons for antiken, jade
// for Kina, indigo for Japan, is for Norden. Den som tagit Romantikerna
// ska kanna igen sin ring utan att lasa nagon text.

import type { CSSProperties } from "react";

export interface Border {
  /** Gruppens slug. Samma id som utmarkelsen. */
  id:    string;
  /** Vad den heter i valjaren. Kortare an gruppens fulla namn. */
  name:  string;
  /** Ringens tva farger, ut och in. */
  from:  string;
  to:    string;
  /** Vinkel pa gradienten, i grader. Skiljer annars lika par at. */
  angle: number;
  /** Tecknet som sitter i ringens nederkant. Ett, aldrig fler. */
  mark:  string;
}

export const BORDERS: readonly Border[] = [
  { id: "the-ancient-world",                            name: "The Ancient World",     from: "#C89B4A", to: "#7A5A22", angle: 135, mark: "ᚠ" },
  { id: "classical-china",                              name: "Classical China",       from: "#5FA88C", to: "#25604B", angle: 160, mark: "月" },
  { id: "japan-and-korea",                              name: "Japan and Korea",       from: "#6C7FC0", to: "#2E3A6E", angle: 200, mark: "花" },
  { id: "persia-arabia-turkey-and-south-asia",          name: "Persia and Arabia",     from: "#3FA9A0", to: "#1B5E5C", angle: 45,  mark: "٭" },
  { id: "old-english-and-the-european-middle-ages",     name: "The Middle Ages",       from: "#9A8A6B", to: "#4A4030", angle: 110, mark: "ᚱ" },
  { id: "renaissance-and-elizabethan-england",          name: "The Renaissance",       from: "#C9A227", to: "#8A5A1B", angle: 70,  mark: "❀" },
  { id: "shakespeare",                                  name: "Shakespeare",           from: "#D4B14C", to: "#6E3B1F", angle: 90,  mark: "✧" },
  { id: "the-metaphysicals-and-the-seventeenth-century", name: "The Metaphysicals",    from: "#8E7BB5", to: "#3B2E5C", angle: 145, mark: "⚹" },
  { id: "the-eighteenth-century",                       name: "The Eighteenth Century", from: "#B8A98C", to: "#6B5B3E", angle: 25, mark: "❖" },
  { id: "the-romantics",                                name: "The Romantics",         from: "#C0637A", to: "#6B2338", angle: 120, mark: "☙" },
  { id: "german-and-continental-romanticism",           name: "Continental Romanticism", from: "#7E96C4", to: "#2F4372", angle: 175, mark: "⚘" },
  { id: "the-victorians",                               name: "The Victorians",        from: "#4F7A5C", to: "#1F3A28", angle: 55,  mark: "❦" },
  { id: "nineteenth-century-america",                   name: "American Nineteenth",   from: "#B5764A", to: "#5E3218", angle: 210, mark: "✵" },
  { id: "france-belgium-and-the-symbolists",            name: "The Symbolists",        from: "#9B6FA8", to: "#42204F", angle: 100, mark: "⚜" },
  { id: "spain-and-latin-america",                      name: "Spain and Latin America", from: "#D08A3C", to: "#7A3B12", angle: 30, mark: "☀" },
  { id: "italy-greece-and-the-modern-mediterranean",    name: "The Mediterranean",     from: "#4E9BC4", to: "#1C4A66", angle: 150, mark: "⚓" },
  { id: "russia-and-eastern-europe",                    name: "Russia and the East",   from: "#B34A4A", to: "#5C1C1C", angle: 80,  mark: "✡" },
  { id: "the-nordic-countries",                         name: "The Nordic Countries",  from: "#8FB8CC", to: "#2E5468", angle: 190, mark: "❄" },
  { id: "modernism-in-english",                         name: "Modernism",             from: "#8C8C8C", to: "#333333", angle: 15,  mark: "◧" },
  { id: "the-wars",                                     name: "The Wars",              from: "#7C6B4E", to: "#33291A", angle: 130, mark: "✠" },
  { id: "britain-and-ireland-since-1930",               name: "Britain and Ireland",   from: "#5F8A6E", to: "#22402C", angle: 165, mark: "☸" },
  { id: "america-since-1930",                           name: "America since 1930",    from: "#4C7FB5", to: "#1B3A5E", angle: 60,  mark: "★" },
  { id: "ballads-folk-songs-and-anonymous-verse",       name: "Ballads and Folk Song", from: "#A8894F", to: "#4E3B1C", angle: 220, mark: "♫" },
  { id: "nonsense-light-verse-and-verse-for-children",  name: "Nonsense and Light Verse", from: "#D9A441", to: "#8A5E12", angle: 40, mark: "☺" },
] as const;

const BY_ID = new Map(BORDERS.map(b => [b.id, b]));

export function borderById(id: string | null | undefined): Border | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/**
 * Ringen som CSS.
 *
 * Gradienten ligger som bakgrund pa en yttre ruta, och bilden sitter
 * innanfor med `padding` som ringens tjocklek. Enklare an en border med
 * gradient, som inte gar att gora runt i CSS utan tva lager anda.
 */
export function ringStyle(border: Border, thickness = 3): CSSProperties {
  return {
    padding:      `${thickness}px`,
    borderRadius: "50%",
    background:   `linear-gradient(${border.angle}deg, ${border.from}, ${border.to})`,
    display:      "inline-flex",
  };
}
