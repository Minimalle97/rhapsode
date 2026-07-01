// lib/stats.ts
// Fas 6: aggregeringslogik för statistiksidan. Rena funktioner som tar redan
// hämtade Prisma-rader och formar dem till det format graferna behöver —
// ingen DB-åtkomst här, det sker i app/(app)/progress/page.tsx.
//
// OBS: dag-bucketing använder UTC-datum (toISOString().slice(0,10)) för
// enkelhets skull. Det kan göra att "idag" växlar en bit fel runt midnatt
// beroende på användarens tidszon — en medveten förenkling, inte en bugg.

const MASTERED_STATUSES = ["mastered", "permanent"];

// ── XP per dag ───────────────────────────────────────────────────────────

export interface DailyXP {
  date: string; // visningsetikett, t.ex. "12 Jun"
  xp:   number;
}

export function buildXpPerDay(
  sessions: { createdAt: Date; xpEarned: number }[],
  days = 30
): DailyXP[] {
  const buckets = initDayBuckets(days);
  for (const s of sessions) {
    const key = utcDateKey(s.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + s.xpEarned);
  }
  return Array.from(buckets.entries()).map(([key, xp]) => ({
    date: formatShortDate(key),
    xp,
  }));
}

// ── Sektionsstatus per verk ────────────────────────────────────────────

export interface SectionStatusRow {
  title:      string;
  notStarted: number;
  learning:   number;
  mastered:   number;
}

export function buildSectionStatusByWork(
  works: { title: string; sections: { status: string }[] }[]
): SectionStatusRow[] {
  return works.map((w) => {
    let notStarted = 0, learning = 0, mastered = 0;
    for (const s of w.sections) {
      if (s.status === "not_started") notStarted++;
      else if (MASTERED_STATUSES.includes(s.status)) mastered++;
      else learning++; // learning | learned | stable
    }
    return { title: w.title, notStarted, learning, mastered };
  });
}

// ── Review-kalender (heatmap) ──────────────────────────────────────────

export interface HeatmapDay {
  date:  string; // ISO-datum (UTC), t.ex. "2026-06-27"
  count: number;
}

export function buildReviewHeatmap(
  sessions: { createdAt: Date }[],
  weeks = 12
): HeatmapDay[] {
  const buckets = initDayBuckets(weeks * 7);
  for (const s of sessions) {
    const key = utcDateKey(s.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

// ── Tid spenderad per verk ──────────────────────────────────────────────

export interface WorkTimeRow {
  title:   string;
  minutes: number;
}

export function buildTimeByWork(
  sessions: { durationSecs: number; section: { work: { id: string; title: string } } }[]
): WorkTimeRow[] {
  const totals = new Map<string, { title: string; secs: number }>();
  for (const s of sessions) {
    if (!s.durationSecs) continue;
    const key  = s.section.work.id;
    const prev = totals.get(key) ?? { title: s.section.work.title, secs: 0 };
    prev.secs += s.durationSecs;
    totals.set(key, prev);
  }
  return Array.from(totals.values())
    .map((t) => ({ title: t.title, minutes: Math.round(t.secs / 60) }))
    .filter((t) => t.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

// ── Score-trend ──────────────────────────────────────────────────────────

export interface ScoreTrendPoint {
  date:  string;
  score: number;
}

/**
 * Score-trend över skriv-läge (write mode) — det enda läget som har ett score.
 * Tolkning: en löpande trend över de senaste sessionerna snarare än en linje
 * per enskild sektion (hade krävt en interaktiv väljare för att inte bli
 * en oläslig spagetti-graf med dussintals sektioner).
 */
export function buildScoreTrend(
  sessions: { createdAt: Date; score: number | null; mode: string }[],
  limit = 30
): ScoreTrendPoint[] {
  return sessions
    .filter((s) => s.mode === "write" && s.score != null)
    .slice(-limit)
    .map((s) => ({
      date:  formatShortDate(utcDateKey(s.createdAt)),
      score: s.score as number,
    }));
}

// ── Delade hjälpfunktioner ────────────────────────────────────────────────

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Skapar en Map med en nyckel per dag de senaste `days` dagarna, värde 0, kronologisk ordning. */
function initDayBuckets(days: number): Map<string, number> {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.set(utcDateKey(d), 0);
  }
  return buckets;
}

function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
