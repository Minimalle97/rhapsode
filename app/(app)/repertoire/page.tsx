// app/(app)/repertoire/page.tsx
//
// Repertoaren: 762 dikter i 24 grupper, med vagen till texterna.
//
// Oppen for alla. Det ar en lasslista och en vagvisare, inte en formån —
// den som inte betalar ska kunna hitta vad som ar vart att kunna utantill
// lika val som den som gor det. Det enda som ligger bakom Pro ar att BARA
// en bard, och det avgors inte har.
//
// Utmarkelser stams av vid varje besok. Appen har ingen schemalaggare, sa
// en grupp som blev klar i gar delas ut nasta gang nagon tittar — samma
// lata monster som mastartitlarna.

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import {
  repertoireState, progressFor, syncGroupAwards, awardsFor,
  TOTAL_ENTRIES,
} from "@/lib/repertoire";
import { GroupCard } from "@/components/repertoire/GroupCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repertoire" };

export default async function RepertoirePage() {
  const user = await requireUser();
  const ent  = await getEntitlements(user);

  const state    = await repertoireState(user.id);
  const progress = progressFor(state);

  // Dela ut det som blivit klart sedan sist, och las sedan om raderna —
  // annars visas en nyss avklarad grupp utan sin utmarkelse forsta gangen.
  await syncGroupAwards(user.id, progress);
  const awards = await awardsFor(user.id);

  const held    = progress.reduce((a, p) => a + p.held, 0);
  const started = progress.reduce((a, p) => a + p.started, 0);
  const done    = progress.filter(p => p.complete).length;

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "48px 24px 80px" }}>
      <h1 style={{
        fontFamily: "var(--fd)", fontSize: "32px", fontWeight: 300,
        letterSpacing: "0.06em", color: "var(--parch)", marginBottom: "8px",
      }}>
        Repertoire
      </h1>
      <p style={{
        fontSize: "14px", color: "var(--muted)",
        lineHeight: 1.7, maxWidth: "620px", marginBottom: "28px",
      }}>
        {TOTAL_ENTRIES.toLocaleString()} poems across four thousand years, chosen
        for the combination of standing and memorability that has kept them in the
        recitation repertoire. Each one links out to an archive where you can read,
        copy or download the text — bring it back here and it becomes a work like
        any other.
      </p>

      {/* Siffrorna hogst upp: vad man gjort av hela listan. */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: "10px", marginBottom: "34px",
      }}>
        <Stat label="Held"    value={held.toLocaleString()}    accent />
        <Stat label="Started" value={started.toLocaleString()} />
        <Stat label="Groups"  value={`${done}/24`} />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "14px",
      }}>
        {progress.map(p => (
          <GroupCard
            key={p.group.id}
            progress={{
              id:       p.group.id,
              numeral:  p.group.numeral,
              name:     p.group.name,
              blurb:    p.group.blurb,
              held:     p.held,
              started:  p.started,
              total:    p.total,
              percent:  p.percent,
              complete: p.complete,
            }}
            award={(() => {
              const a = awards.get(p.group.id);
              return a ? { earned: true, unlocked: a.unlockedAt !== null } : null;
            })()}
            isPro={ent.isPro}
          />
        ))}
      </div>

      {!ent.isPro && (
        <p style={{ marginTop: "40px", paddingTop: "22px", borderTop: "1px solid var(--bord)" }}>
          <Link href="/settings/subscription" style={{
            fontSize: "13px", color: "var(--muted)", textDecoration: "none", lineHeight: 1.7,
          }}>
            <span style={{ color: "var(--gold)" }}>Rhapsode Pro</span>
            {" — every group here is yours to finish either way, and the medal comes "}
            {"with it. Pro is what lets you wear the border."}
          </Link>
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--bord)",
      borderRadius: "var(--r2)", padding: "14px 16px",
    }}>
      <p style={{
        fontSize: "10px", letterSpacing: "0.15em", color: "var(--muted)",
        textTransform: "uppercase", marginBottom: "5px",
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: "var(--fd)", fontSize: "24px", fontWeight: 300,
        color: accent ? "var(--green)" : "var(--parch)",
      }}>
        {value}
      </p>
    </div>
  );
}
