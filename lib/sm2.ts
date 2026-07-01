// lib/sm2.ts
// SM-2 Spaced Repetition Algorithm
// https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method
//
// Fas 8: lägger till scoreToQuality() — write- och recite-läget får ett
// 0-100 score från aiGrade() istället för en självskattning, och behöver
// en bro till SM-2:s 0-5-skala.

import type { SectionStatus } from "@/types";

export interface SM2Input {
  quality: number;   // 0-5: 0-2 = failed, 3 = pass, 4 = good, 5 = perfect
  sm2Reps: number;
  sm2EF: number;     // Easiness Factor, starts at 2.5
  sm2Interval: number; // days
}

export interface SM2Output {
  sm2Reps: number;
  sm2EF: number;
  sm2Interval: number;
  nextReview: Date;
  status: SectionStatus;
}

export function sm2(input: SM2Input): SM2Output {
  const { quality, sm2Reps, sm2EF, sm2Interval } = input;

  let newReps = sm2Reps;
  let newEF = sm2EF;
  let newInterval = sm2Interval;

  if (quality >= 3) {
    // Korrekt svar
    if (sm2Reps === 0) {
      newInterval = 1;
    } else if (sm2Reps === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(sm2Interval * sm2EF);
    }
    newReps = sm2Reps + 1;
  } else {
    // Fel svar — återstarta intervall
    newReps = 0;
    newInterval = 1;
  }

  // Uppdatera EF
  newEF = sm2EF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + newInterval);

  return {
    sm2Reps: newReps,
    sm2EF: newEF,
    sm2Interval: newInterval,
    nextReview,
    status: deriveStatus(newReps, newInterval),
  };
}

function deriveStatus(reps: number, interval: number): SectionStatus {
  if (reps === 0)     return "not_started";
  if (reps <= 1)      return "learning";
  if (interval < 7)   return "learned";
  if (interval < 21)  return "stable";
  if (interval < 60)  return "mastered";
  return "permanent";
}

/**
 * Bryggar ett 0-100 AI-betyg (write/recite-läge) till SM-2:s 0-5-skala.
 * Trösklarna är medvetet strängare än ett skol-betygssystem — SM-2 ska
 * bara ge "pass" (≥3) när återgivningen var faktiskt nästan ordagrann,
 * inte bara "i stort sett rätt riktning".
 */
export function scoreToQuality(score: number): number {
  if (score >= 95) return 5;
  if (score >= 85) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  if (score >= 25) return 1;
  return 0;
}
