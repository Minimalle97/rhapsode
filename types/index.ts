// types/index.ts
// Fas 8: PracticeMode += "recite"; recordingPath på PracticeSession +
// UpdateSectionPayload. Inga andra ändringar i befintliga typer.

export type WorkType =
  | "POEM" | "EPIC" | "PLAY" | "SPEECH"
  | "PHILOSOPHICAL" | "RELIGIOUS" | "PROFESSIONAL" | "OTHER";

export type SectionStatus =
  | "not_started" | "learning" | "learned" | "stable" | "mastered" | "permanent";

export type PracticeMode = "read" | "hide" | "write" | "recite";

export interface RhapsodeUser {
  id:         string;
  clerkId:    string;
  username:   string;
  avatarUrl:  string | null;
  xp:         number;
  rank:       string;
  streakDays: number;
  lastActive: Date;
  createdAt:  Date;
}

export interface Work {
  id:              string;
  userId:          string;
  title:           string;
  author:          string;
  type:            WorkType;
  tags:            string[];
  analysis:        string | null;
  practiceAdvice:  string | null;
  difficulty:      "easy" | "medium" | "hard";
  estimatedMinutes: number;
  createdAt:       Date;
  sections:        Section[];
}

export interface Section {
  id:          string;
  workId:      string;
  name:        string;
  content:     string;
  difficulty:  string;
  status:      SectionStatus;
  orderIndex:  number;
  sm2Reps:     number;
  sm2EF:       number;
  sm2Interval: number;
  nextReview:  Date | null;
  createdAt:   Date;
}

export interface PracticeSession {
  id:            string;
  sectionId:     string;
  quality:       number;
  score:         number | null;
  mode:          PracticeMode;
  xpEarned:      number;
  durationSecs:  number;
  recordingPath: string | null;
  createdAt:     Date;
}

export interface Medal {
  id:       string;
  userId:   string;
  workId:   string;
  title:    string;
  earnedAt: Date;
}

// ── Samlingar (Fas 5) ───────────────────────────────────────────────────
export interface Collection {
  id:         string;
  userId:     string;
  name:       string;
  color:      string | null;
  orderIndex: number;
  createdAt:  Date;
  workIds:    string[];
}

export interface CreateCollectionPayload {
  name:  string;
  color?: string;
}

export interface UpdateCollectionPayload {
  name?:        string;
  color?:       string;
  addWorkId?:   string;
  removeWorkId?: string;
}

// ── Sök & filter (Fas 5) ─────────────────────────────────────────────────
export type LibraryStatusFilter = "not_started" | "in_progress" | "mastered";

export interface LibraryFilters {
  q?:            string;
  type?:         WorkType;
  tag?:          string;
  difficulty?:   "easy" | "medium" | "hard";
  status?:       LibraryStatusFilter;
  collectionId?: string;
}

// API payloads
export interface CreateWorkPayload {
  title:    string;
  author:   string;
  type:     WorkType;
  tags?:    string[];
  analysis?: string;
  practiceAdvice?: string;
  difficulty?:      "easy" | "medium" | "hard";
  estimatedMinutes?: number;
  sections: {
    name:       string;
    content:    string;
    difficulty?: string;
    orderIndex:  number;
  }[];
}

export interface UpdateSectionPayload {
  quality:        number;
  score?:         number;
  mode:           PracticeMode;
  durationSecs?:  number;
  recordingPath?: string; // Fas 8: storage-path om en inspelning sparades

  // Uträknat deterministiskt av /api/practice/grade och sparat på
  // sessionen, så att mästerskapsalgoritmen kan skärpas i efterhand utan
  // att gammal historik blir värdelös.
  wordsTotal?:   number;
  wordsCorrect?: number;
  missedWords?:  string[];
  cueLevel?:     string;
}

export interface SM2Result {
  status:      SectionStatus;
  sm2Reps:     number;
  sm2EF:       number;
  sm2Interval: number;
  nextReview:  Date;
  xpEarned:    number;
}

export interface Rank {
  level:      number;
  titleEn:    string;
  titleSv:    string;
  xpRequired: number;
}

// Re-export export-typer
export type { RhapsodeExport, ExportWork, ExportSection } from "./export";
