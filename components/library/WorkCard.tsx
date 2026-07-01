"use client";
// components/library/WorkCard.tsx
// Fas 5: utvunnen från library/page.tsx (var tidigare en lokal funktion där).
// Tillägg: tag-chips och AddToCollectionMenu.

import Link from "next/link";
import type { CSSProperties } from "react";
import { AddToCollectionMenu } from "./AddToCollectionMenu";
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
}

export function WorkCard({ work, collections, memberCollectionIds, activeTag }: WorkCardProps) {
  const total    = work.sections.length;
  const mastered = work.sections.filter(
    (s) => s.status === "mastered" || s.status === "permanent"
  ).length;
  const progress = total > 0 ? Math.round((mastered / total) * 100) : 0;

  return (
    <div style={{ position: "relative" }}>
      <Link href={`/work/${work.id}`} style={{ textDecoration: "none" }}>
        <div
          style={cardStyle}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "rgba(200,164,80,0.3)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--bord)")}
        >
          <p style={typeLabelStyle}>{work.type}</p>

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

          {/* Progress bar */}
          <div style={{ height: "2px", background: "var(--bg4)", borderRadius: "1px", marginBottom: "8px" }}>
            <div
              style={{
                height:       "100%",
                width:        `${progress}%`,
                background:   "var(--gold)",
                borderRadius: "1px",
                transition:   "width .3s",
              }}
            />
          </div>
          <p style={{ fontSize: "12px", color: "var(--muted)" }}>
            {mastered}/{total} sections memorized
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
  marginBottom:  "6px",
  paddingRight:  "30px", // lämnar plats för ⋯-menyn
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
