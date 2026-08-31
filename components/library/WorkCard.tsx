"use client";
// components/library/WorkCard.tsx
// Fas 5: utvunnen från library/page.tsx (var tidigare en lokal funktion där).
// Tillägg: tag-chips och AddToCollectionMenu.

import Link from "next/link";
import type { CSSProperties } from "react";
import { AddToCollectionMenu } from "./AddToCollectionMenu";
import { DuelBadge, DUEL_BORDER } from "@/components/duels/DuelBadge";
import type { Collection } from "@/types";

interface WorkCardWork {
  id:     string;
  title:  string;
  author: string;
  type:   string;
  tags:   string[];
  sections: { status: string }[];
}

interface WorkCardProps {
  work:                 WorkCardWork;
  collections:          Collection[];
  memberCollectionIds:  string[];
  activeTag?:           string | null;
  /** 0-100. Rors redan vid forsta passet, inte forst nar en sektion ar klar. */
  progress:             number;
  /** Tio godkanda framforanden, och titeln star kvar. Ger den roda ramen. */
  performanceMastered:  boolean;
  /** Bemastrad men inte framford pa ett tag. */
  masteryAtRisk:        boolean;
  /** Satt nar verket star i en tvekamp. Ger den grona ramen och bubblan. */
  duel?:                { endsAt: string; opponentName: string } | null;
}

export function WorkCard({
  work, collections, memberCollectionIds, activeTag,
  progress, performanceMastered, masteryAtRisk, duel = null,
}: WorkCardProps) {
  const total    = work.sections.length;
  const mastered = work.sections.filter(
    (s) => s.status === "mastered" || s.status === "permanent"
  ).length;
  const learned = progress >= 100;

  // Rod ram = mastartiteln galler. Den ar avsiktligt den enda roda saken i
  // biblioteket, sa att den betyder nagot pa avstand.
  //
  // Gron ram = tvekamp, och den star over den roda sa lange klockan gar.
  // Skalet ar att den ar tillfallig och tidsbunden: mastartiteln star
  // kvar imorgon, kampen gor det inte, sa det ar den som behover synas nu.
  const border = duel ? DUEL_BORDER : performanceMastered ? "var(--red)" : "var(--bord)";
  const hover  = duel ? DUEL_BORDER : performanceMastered ? "var(--red)" : "rgba(200,164,80,0.3)";

  return (
    <div style={{ position: "relative" }}>
      <Link href={`/work/${work.id}`} style={{ textDecoration: "none" }}>
        <div
          style={{ ...cardStyle, borderColor: border }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = hover)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = border)}
        >
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            flexWrap: "wrap", marginBottom: "6px", paddingRight: "30px",
          }}>
            <p style={typeLabelStyle}>{work.type}</p>
            {duel && <DuelBadge endsAt={duel.endsAt} />}
          </div>

          <h3 style={titleStyle}>{work.title}</h3>
          <p style={authorStyle}>{work.author}</p>

          {work.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
              {work.tags.map((tag) => (
                <span key={tag} style={cardTagStyle(tag === activeTag)}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/*
            RATTAT: stapeln visade tidigare bara andelen HELT bemastrade
            sektioner, alltsa noll under hela den period da man arbetade
            som mest. Man sag inte att nagot hande.

            Nu ger varje sektion delpoang efter hur langt den kommit, och
            stapeln borjar rora sig vid forsta passet.
          */}
          <div style={{
            height: "5px", background: "var(--bg4)",
            borderRadius: "3px", marginBottom: "9px", overflow: "hidden",
          }}>
            <div
              style={{
                height:       "100%",
                width:        `${progress}%`,
                background:   performanceMastered
                  ? "var(--red)"
                  : learned
                    ? "linear-gradient(90deg, var(--gold2), var(--gold))"
                    : "var(--gold2)",
                borderRadius: "3px",
                transition:   "width .5s ease",
              }}
            />
          </div>

          <p style={{ fontSize: "12px", color: "var(--muted)" }}>
            {performanceMastered ? (
              <span style={{ color: "var(--red)" }}>
                Mastered{masteryAtRisk ? " · perform it soon" : ""}
              </span>
            ) : learned ? (
              <span style={{ color: "var(--gold)" }}>Learned · ready to perform</span>
            ) : (
              <>{progress}% learned · {mastered}/{total} sections held</>
            )}
          </p>
        </div>
      </Link>

      {/* Ligger som syskon till <Link>, inte ett barn — undviker knapp-i-länk */}
      <div style={{ position: "absolute", top: "16px", right: "14px" }}>
        <AddToCollectionMenu workId={work.id} collections={collections} memberIds={memberCollectionIds} />
      </div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background:   "var(--bg2)",
  border:       "1px solid var(--bord)",
  borderRadius: "var(--r)",
  padding:      "20px",
  cursor:       "pointer",
  transition:   "border-color .15s",
};

const typeLabelStyle: CSSProperties = {
  fontSize:      "10px",
  letterSpacing: "0.2em",
  color:         "var(--gold)",
  textTransform: "uppercase",
  // Marginal och luft for ⋯-menyn ligger nu pa raden som haller bade den
  // har etiketten och tvekampsbubblan.
};

const titleStyle: CSSProperties = {
  fontFamily:   "var(--fd)",
  fontSize:     "20px",
  fontWeight:   400,
  color:        "var(--parch)",
  marginBottom: "4px",
};

const authorStyle: CSSProperties = {
  fontSize:     "13px",
  color:        "var(--muted)",
  marginBottom: "14px",
};

function cardTagStyle(active: boolean): CSSProperties {
  return {
    fontSize:     "10.5px",
    padding:      "2px 8px",
    borderRadius: "999px",
    border:       active ? "1px solid var(--gold)" : "1px solid var(--bord)",
    color:        active ? "var(--gold)" : "var(--muted)",
    background:   active ? "var(--gold4)" : "transparent",
  };
}
