// types/export.ts
// Typer för export/import-formatet

import type { WorkType, SectionStatus } from "./index";

export interface RhapsodeExport {
  version:    "1.0";
  exportedAt: string;          // ISO 8601
  user: {
    username: string;
  };
  works: ExportWork[];
}

export interface ExportWork {
  title:           string;
  author:          string;
  type:            WorkType;
  tags:            string[];
  analysis:        string | null;
  practiceAdvice:  string | null;
  difficulty:      "easy" | "medium" | "hard";
  estimatedMinutes: number;
  createdAt:       string;     // ISO 8601
  sections:        ExportSection[];
}

export interface ExportSection {
  name:        string;
  content:     string;
  difficulty:  string;
  status:      SectionStatus;
  orderIndex:  number;
  sm2Reps:     number;
  sm2EF:       number;
  sm2Interval: number;
  nextReview:  string | null;  // ISO 8601
}
