// components/stats/ProjectionCard.tsx
// Visar hur långt bort slutet ligger i nuvarande takt.
// Serverkomponent — hämtar sin egen data.

import { prisma } from "@/lib/db";
import { project, paceLine } from "@/lib/projection";

const MASTERED = ["mastered", "permanent"];

export async function ProjectionCard({ workId }: { workId: string }) {
  const now = new Date();

  const [total, mastered, sessions] = await Promise.all([
    prisma.section.count({ where: { workId } }),
    prisma.section.count({ where: { workId, status: { in: MASTERED } } }),
    // Sessioner med hög kvalitet den senaste månaden används som
    // närmevärde för när sektioner faktiskt satte sig
    prisma.practiceSession.findMany({
      where: {
        section:   { workId, status: { in: MASTERED } },
        quality:   { gte: 4 },
        createdAt: { gte: new Date(now.getTime() - 28 * 86_400_000) },
      },
      select:   { createdAt: true, sectionId: true },
      distinct: ["sectionId"],
    }),
  ]);

  const p = project({
    total,
    mastered,
    recentMasteryDates: sessions.map(s => s.createdAt),
    now,
  });

  // För korta verk säger prognosen ingenting vettigt
  if (p.tooSmall && p.percent < 100) return null;
  if (total === 0) return null;

  // Bantad. Rutan hade en rubrik, en fras i trettio punkter och en
  // underrad — tre vaningar for en enda uppgift, och den tog mer plats an
  // framforandekortet ovanfor den. Nu ar allt en rad: frasen i
  // lasstorlek, siffrorna direkt efter.
  return (
    <div style={{
      background:   "var(--bg2)",
      border:       "1px solid var(--bord)",
      borderRadius: "var(--r2)",
      padding:      "13px 16px",
      marginBottom: "20px",
    }}>
      <div style={{
        display: "flex", alignItems: "baseline",
        gap: "10px", flexWrap: "wrap", marginBottom: "2px",
      }}>
        <span style={{
          fontFamily: "var(--fd)", fontSize: "17px", fontWeight: 400,
          color: p.percent === 100 ? "var(--gold)" : "var(--parch)",
        }}>
          {p.phrase}
        </span>
        <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
          {p.mastered.toLocaleString()} of {p.total.toLocaleString()} sections held
          {p.perWeek > 0 && ` · ${paceLine(p.perWeek).toLowerCase()}`}
        </span>
      </div>

      {/* Årsband — varje segment en månad framåt */}
      {p.weeksLeft !== null && p.weeksLeft > 8 && (
        <Timeline weeksLeft={p.weeksLeft} percent={p.percent} />
      )}

      {p.perWeek === 0 && p.percent < 100 && p.mastered > 0 && (
        <p style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
          The pace shown is based on the last four weeks. Come back for a
          while and a real estimate will appear.
        </p>
      )}
    </div>
  );
}

function Timeline({ weeksLeft, percent }: { weeksLeft: number; percent: number }) {
  const monthsLeft = Math.ceil(weeksLeft / 4.345);
  const segments   = Math.min(36, Math.max(6, monthsLeft));
  const filled     = Math.round((percent / 100) * segments);

  return (
    <div>
      <div style={{ display: "flex", gap: "2px", marginBottom: "6px" }}>
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            style={{
              flex: 1, height: "5px", borderRadius: "1px",
              background: i < filled ? "var(--gold)" : "var(--bg4)",
              opacity: i < filled ? 1 : 0.5,
            }}
          />
        ))}
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: "10px", color: "var(--bg4)",
      }}>
        <span>now</span>
        <span>
          {monthsLeft >= 12
            ? `${(monthsLeft / 12).toFixed(monthsLeft < 24 ? 1 : 0)} years`
            : `${monthsLeft} months`}
        </span>
      </div>
    </div>
  );
}
