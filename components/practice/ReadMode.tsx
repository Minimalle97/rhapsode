"use client";
// components/practice/ReadMode.tsx
// Fas 8: enklaste läget — läs texten, skatta dig själv.
//
// Texten ritas av SectionText, samma renderare som laslaget under
// /work/<id>/read anvander. Den hade tidigare en egen <p> med pre-wrap,
// vilket rackte sa lange den enda uppgiften var att visa raderna — men
// tva renderare hade betytt att en pjas kunde brytas pa ett satt har och
// ett annat dar, och att rollangivelser bara syntes i den ena.

import type { CSSProperties } from "react";
import { QualityRating } from "./QualityRating";
import { SectionText } from "@/components/reading/SectionText";

interface ReadModeProps {
  content:    string;
  onComplete: (quality: number) => void;
}

export function ReadMode({ content, onComplete }: ReadModeProps) {
  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <SectionText content={content} size="compact" />
      </div>
      <p style={promptStyle}>How well do you know this?</p>
      <QualityRating onRate={onComplete} />
    </div>
  );
}

const promptStyle: CSSProperties = {
  fontSize:     "12px",
  color:        "var(--muted)",
  marginBottom: "10px",
  letterSpacing: "0.02em",
};
