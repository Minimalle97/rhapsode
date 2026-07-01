"use client";
// components/practice/ReadMode.tsx
// Fas 8: enklaste läget — läs texten, skatta dig själv.

import type { CSSProperties } from "react";
import { QualityRating } from "./QualityRating";

interface ReadModeProps {
  content:    string;
  onComplete: (quality: number) => void;
}

export function ReadMode({ content, onComplete }: ReadModeProps) {
  return (
    <div>
      <p style={textStyle}>{content}</p>
      <p style={promptStyle}>How well do you know this?</p>
      <QualityRating onRate={onComplete} />
    </div>
  );
}

const textStyle: CSSProperties = {
  fontFamily: "var(--fd)",
  fontSize:   "20px",
  lineHeight: 1.7,
  color:      "var(--parch)",
  marginBottom: "28px",
  whiteSpace: "pre-wrap",
};

const promptStyle: CSSProperties = {
  fontSize:     "12px",
  color:        "var(--muted)",
  marginBottom: "10px",
  letterSpacing: "0.02em",
};
