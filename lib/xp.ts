// lib/xp.ts
// XP-tabell, rank-definitioner och hjälpfunktioner

import type { Rank } from "@/types";

export const XP_TABLE = {
  practice_hard: 5,
  practice_ok: 12,
  practice_easy: 20,
  write_score_50: 10,
  write_score_70: 20,
  write_score_90: 35,
  write_score_100: 50,
  section_mastered: 75,
  work_completed: 500,
  daily_streak_bonus: 25,
} as const;

// Ranker inspirerade av Platons stat — stigande ordning
export const RANKS: Rank[] = [
  { level: 1, titleEn: "The Uninitiated",       titleSv: "Den Oinvigde",        xpRequired: 0 },
  { level: 2, titleEn: "Apprentice of Forms",   titleSv: "Formernas Lärling",   xpRequired: 100 },
  { level: 3, titleEn: "Seeker of Truth",        titleSv: "Sanningens Sökare",   xpRequired: 300 },
  { level: 4, titleEn: "Friend of Wisdom",       titleSv: "Visdomens Vän",       xpRequired: 750 },
  { level: 5, titleEn: "Keeper of Memory",       titleSv: "Minnets Väktare",     xpRequired: 1500 },
  { level: 6, titleEn: "Guardian of the Republic", titleSv: "Republikens Väktare", xpRequired: 3000 },
  { level: 7, titleEn: "Philosopher",            titleSv: "Filosofen",           xpRequired: 6000 },
  { level: 8, titleEn: "Philosopher-King",       titleSv: "Filosofkonungen",     xpRequired: 12000 },
  { level: 9, titleEn: "The Rhapsode",           titleSv: "Rapsoden",            xpRequired: 25000 },
];

export function getRank(xp: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].xpRequired) return RANKS[i];
  }
  return RANKS[0];
}

export function getNextRank(xp: number): Rank | null {
  const current = getRank(xp);
  return RANKS.find(r => r.level === current.level + 1) ?? null;
}

export function xpToNextRank(xp: number): number {
  const next = getNextRank(xp);
  return next ? next.xpRequired - xp : 0;
}

/**
 * Beräkna XP för en avslutad träningssession.
 * quality: 0-5 (SM-2-skala), score: 0-100 (write-mode, annars undefined)
 */
export function calcSessionXP(quality: number, score?: number): number {
  if (score !== undefined) {
    if (score >= 100) return XP_TABLE.write_score_100;
    if (score >= 90)  return XP_TABLE.write_score_90;
    if (score >= 70)  return XP_TABLE.write_score_70;
    return XP_TABLE.write_score_50;
  }
  if (quality <= 2) return XP_TABLE.practice_hard;
  if (quality <= 3) return XP_TABLE.practice_ok;
  return XP_TABLE.practice_easy;
}
