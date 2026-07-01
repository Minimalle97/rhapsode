// components/stats/chartTheme.ts
// Fas 6: hex-konstanter för Recharts.
//
// Varför inte var(--gold) direkt? Recharts sätter stroke/fill som råa SVG-
// presentationsattribut, inte via style-attributet — och sådana attribut
// löser inte alltid CSS custom properties tillförlitligt mellan webbläsare.
// Resten av appen använder var(--gold) etc. inuti style={{...}}, vilket
// fungerar utmärkt; det är bara just Recharts' SVG-props som behöver
// literala värden. Värdena nedan är synkade med app/globals.css.

export const CHART_COLORS = {
  gold:   "#C8A450",
  gold2:  "#A8883A",
  parch:  "#EDE5CC",
  parch2: "#C8BFA6",
  muted:  "#7A8899",
  red:    "#C05F72",
  green:  "#6A9E6A",
  blue:   "#5B8BB5",
  grid:   "rgba(200, 164, 80, 0.13)",
  bg3:    "#1A2029",
  bg4:    "#222B36",
} as const;

export const PIE_SLICE_COLORS = [
  CHART_COLORS.gold,
  CHART_COLORS.blue,
  CHART_COLORS.green,
  CHART_COLORS.red,
  CHART_COLORS.gold2,
  CHART_COLORS.parch2,
  CHART_COLORS.muted,
];
