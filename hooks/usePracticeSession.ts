"use client";
// hooks/usePracticeSession.ts
// Fas 8: submitSession tar nu även emot recordingPath (valfri) — och får,
// för första gången sedan Fas 1, en faktisk anropare: PracticePanel.

import { useState, useCallback } from "react";
import type { PracticeMode } from "@/types";

export interface SessionResult {
  xpEarned:      number;
  newXP:         number;
  rank:          string;
  rankUp:        boolean;
  medal:         { title: string; workTitle: string; author: string } | null;
  streakDays:    number;
  streakBonusXP: number;
  dailyGoal: {
    completedSecs: number;
    targetSecs:    number;
    goalMet:       boolean;
  };
}

export function usePracticeSession(prevRank: string) {
  const [result, setResult]   = useState<SessionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const submitSession = useCallback(async (
    sectionId:      string,
    quality:        number,
    mode:           PracticeMode,
    score?:         number,
    durationSecs?:  number,
    recordingPath?: string,
    /** Uträknat av /api/practice/grade. Sparas för mästerskapsalgoritmen. */
    detail?: {
      wordsTotal:   number;
      wordsCorrect: number;
      missed:       string[];
      cueLevel:     string;
    },
  ) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sections?id=${sectionId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          quality, mode, score, durationSecs, recordingPath,
          wordsTotal:   detail?.wordsTotal,
          wordsCorrect: detail?.wordsCorrect,
          missedWords:  detail?.missed,
          cueLevel:     detail?.cueLevel,
        }),
      });

      if (!res.ok) throw new Error("Session failed");

      const data = await res.json();

      setResult({
        xpEarned:      data.xpEarned,
        newXP:         data.newXP,
        rank:          data.rank,
        rankUp:        data.rank !== prevRank,
        medal:         data.medalAwarded
          ? {
              title:     data.medalAwarded.title,
              workTitle: data.medalAwarded.workTitle ?? "",
              author:    data.medalAwarded.author    ?? "",
            }
          : null,
        streakDays:    data.streak?.days ?? 0,
        streakBonusXP: data.streak?.bonusXP ?? 0,
        dailyGoal: {
          completedSecs: data.streak?.completedSecs ?? 0,
          targetSecs:    data.streak?.targetSecs ?? 600,
          goalMet:       data.streak?.goalMet ?? false,
        },
      });

      return data;
    } finally {
      setLoading(false);
    }
  }, [prevRank]);

  const clearResult = useCallback(() => setResult(null), []);

  return { submitSession, result, clearResult, loading };
}
