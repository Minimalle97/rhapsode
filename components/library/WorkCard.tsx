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
  /** 0-100. Rors redan vid forsta passet, inte forst nar en sektion ar klar. */
  progress:             number;
  /** Tio godkanda framforanden, och titeln star kvar. Ger den roda ramen. */
  performanceMastered:  boolean;
  /** Bemastrad men inte framford pa ett tag. */
  masteryAtRisk:        boolean;
  /** Satt nar verket star i en tvekamp. Ger den grona ramen och bubblan. */
  duel?: {
    id:           string;
    endsAt:       string;
    opponentName: string;
    /** Ditt basta framforande i kampen. null innan du gjort nagot. */
    best:         { wordsHeld: number; wordsPossible: number; accuracy: number } | null;
  } | null;
}

export function WorkCard({
  work, collections, memberCollectionIds,
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
          style={{
            ...cardStyle,
            borderColor: border,
            ...(duel ? { borderRadius: "var(--r) var(--r) 0 0" } : {}),
          }}
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

          {/*
            Perioden, formen, temat — samma uppgifter som forut, men som
            text i stallet for hashtaggar.

            De var aldrig taggar i den mening en hashtagg antyder: de sattes
            av katalogiseringen (period, form, sprak, tema — se
            lib/aiMetadata.ts), inte av anvandaren, och ingen skrev dem for
            att gruppera nagot. En brandgul #victorian ser ut som ett filter
            man kan trycka pa, och att lova det utan att mena det ar samre
            an att bara saga vad texten ar.
          */}
          {work.tags.length > 0 && (
            <p style={metaStyle}>
              {work.tags.map(titleCase).join(" · ")}
            </p>
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

      {/*
        Tvekampsrutan. Syskon till <Link>, inte barn — en lank inuti en
        lank ar ogiltig uppmarkning och gor att fel sida oppnas.

        Star UNDER kortet i stallet for inuti, sa att den grona ramen
        omsluter bade verket och kampen: det ar ett stalle, inte tva.
      */}
      {duel && (
        <div style={duelBoxStyle}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>
              vs {duel.opponentName}
            </p>
            {duel.best ? (
              <p style={{ fontSize: "12.5px", color: "var(--green)" }}>
                Best {duel.best.wordsHeld}
                {duel.best.wordsPossible > 0 && `/${duel.best.wordsPossible}`} words
                <span style={{ color: "var(--muted)" }}> · {duel.best.accuracy}%</span>
              </p>
            ) : (
              <p style={{ fontSize: "12.5px", color: "var(--muted)" }}>
                Not performed yet
              </p>
            )}
          </div>

          <Link href={`/duel/${duel.id}`} style={duelBtnStyle}>
            {duel.best ? "Perform again" : "Duel performance"}
          </Link>
        </div>
      )}

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

const metaStyle: CSSProperties = {
  fontSize:      "11.5px",
  color:         "var(--muted)",
  letterSpacing: "0.02em",
  marginBottom:  "14px",
  lineHeight:    1.5,
};

const duelBoxStyle: CSSProperties = {
  display:      "flex",
  alignItems:   "center",
  gap:          "10px",
  flexWrap:     "wrap",
  marginTop:    "-1px",           // moter kortets ram utan dubbel linje
  padding:      "11px 14px",
  background:   "rgba(106,158,106,0.07)",
  border:       `1px solid ${DUEL_BORDER}`,
  borderTop:    "none",
  borderRadius: "0 0 var(--r) var(--r)",
};

const duelBtnStyle: CSSProperties = {
  padding:        "7px 14px",
  borderRadius:   "var(--r3)",
  background:     "var(--green)",
  border:         "1px solid var(--green)",
  color:          "var(--bg)",
  fontSize:       "12px",
  textDecoration: "none",
  whiteSpace:     "nowrap",
  flexShrink:     0,
};

/** "victorian" → "Victorian". Katalogiseringen skriver gemener. */
function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
