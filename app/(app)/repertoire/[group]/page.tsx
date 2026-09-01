// app/(app)/repertoire/[group]/page.tsx
//
// En grupp, dikt for dikt.
//
// Varje rad ar en titel, en upphovsperson och vagen till texten. Ingen
// dikttext star har och ingen kommer att gora det — se
// lib/repertoire/data.ts. Lankarna gar till arkiven, och dar hamtar man
// texten sjalv.
//
// Gron rad = verksmedaljen ar utdelad, alltsa hela dikten sitter.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  groupById, repertoireState, progressFor, syncGroupAwards, awardsFor,
} from "@/lib/repertoire";
import { EntryList } from "@/components/repertoire/EntryList";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ group: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { group } = await params;
  return { title: groupById(group)?.name ?? "Repertoire" };
}

export default async function GroupPage({ params }: Props) {
  const { group: slug } = await params;
  const group = groupById(slug);
  if (!group) notFound();

  const user  = await requireUser();
  const state = await repertoireState(user.id);

  // Samma avstamning som oversikten gor. Kommer man hit direkt — via en
  // lank eller ett bokmarke — ska gruppen kunna bli klar har ocksa.
  const progress = progressFor(state);
  await syncGroupAwards(user.id, progress);
  const awards = await awardsFor(user.id);

  const mine     = progress.find(p => p.group.id === slug)!;
  const award    = awards.get(slug);
  const unlocked = award?.unlockedAt != null;

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link href="/repertoire" style={{
        fontSize: "13px", color: "var(--muted)",
        textDecoration: "none", display: "inline-block", marginBottom: "24px",
      }}>
        ← Repertoire
      </Link>

      <p style={{
        fontSize: "11px", letterSpacing: "0.2em",
        color: mine.complete ? "var(--green)" : "var(--gold)", marginBottom: "8px",
      }}>
        {group.numeral}
      </p>

      <h1 style={{
        fontFamily: "var(--fd)", fontSize: "clamp(26px, 5vw, 36px)", fontWeight: 300,
        letterSpacing: "0.03em", color: "var(--parch)",
        lineHeight: 1.15, marginBottom: "8px",
      }}>
        {group.name}
      </h1>

      {group.blurb && (
        <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.7, marginBottom: "22px" }}>
          {group.blurb}
        </p>
      )}

      {/* Stallningen i gruppen */}
      <div style={{
        background: "var(--bg2)",
        border: `1px solid ${mine.complete ? "rgba(106,158,106,0.45)" : "var(--bord)"}`,
        borderRadius: "var(--r)", padding: "16px 18px", marginBottom: "28px",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "baseline", marginBottom: "8px", gap: "10px", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: "13px", color: "var(--parch2)" }}>
            {mine.held} of {mine.total} held
          </span>
          <span style={{
            fontFamily: "var(--fd)", fontSize: "17px",
            color: mine.complete ? "var(--green)" : "var(--parch2)",
          }}>
            {mine.percent}%
          </span>
        </div>

        <div style={{ height: "5px", background: "var(--bg4)", borderRadius: "3px", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${mine.percent}%`,
            background: mine.complete
              ? "var(--green)"
              : "linear-gradient(90deg, rgba(106,158,106,0.65), var(--green))",
            transition: "width .5s ease",
          }} />
        </div>

        {mine.complete && (
          <p style={{ fontSize: "12px", color: "var(--green)", marginTop: "12px", lineHeight: 1.6 }}>
            You hold this group entire. The medal is on your profile
            {unlocked
              ? ", and the border is yours to wear."
              : " — the border is waiting behind the lock on the overview."}
          </p>
        )}
      </div>

      <EntryList
        entries={group.entries.map(e => {
          const s = state.get(e.id);
          return {
            id:      e.id,
            title:   e.title,
            author:  e.author,
            starred: e.starred,
            links:   [...e.links],
            workId:  s?.workId ?? null,
            held:    s?.held ?? false,
          };
        })}
      />
    </div>
  );
}
