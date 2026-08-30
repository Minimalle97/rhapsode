// lib/ai/features.ts
//
// Katalog över de anrop som faktiskt behöver en språkmodell.
//
// Innan något hamnar här ska det ha svarat ja på en fråga: går det här
// att räkna ut? Rättning av en recitation gör det — jämförelsen mellan
// två ordföljder är Levenshtein, inte semantik, och den ligger i
// lib/cue.ts. Framsteg, streaks, procent, vilka rader som missades,
// statistik: allt är aritmetik. Ingenting av det får hamna i den här
// filen.
//
// Kvar blir det verkligt genererande: att hitta på övningar, förklara ett
// svårt ställe, bygga en ordlista, lägga upp ett studiepass.

import { FEATURE, type Feature } from "@/lib/billing/plans";
import type { ModelTier } from "./models";

export type AiFeatureId =
  | "text_cleanup"
  | "work_metadata"
  | "medal_title"
  | "recitation_analysis"
  | "exercises"
  | "glossary"
  | "translation"
  | "explain_passage"
  | "study_plan"
  | "tutor_chat";

export interface AiFeatureSpec {
  id: AiFeatureId;
  /** Behörigheten som krävs. null = ingår i Free. */
  requires: Feature | null;
  tier: ModelTier;
  /** Höjs när prompten ändras — ogiltigförklarar cachade svar. */
  promptVersion: number;
  /**
   * Räknas mot användarens månadskvot.
   *
   * false betyder inte gratis. Det betyder att anropet är systemets eget
   * påfund och inte något användaren bett om, så det vore oärligt att
   * dra det från deras fem generationer. Det loggas fortfarande i
   * AiUsage, för kostnaden är verklig.
   */
  metered: boolean;
  /**
   * Får svaret delas mellan användare?
   *
   * Sant bara när frågan handlar om texten och ingenting annat. Så fort
   * någons egen historik påverkar svaret måste det vara false.
   */
  shareable: boolean;
  /** Dagar innan ett cachat svar går ut. Utelämnat = för alltid. */
  cacheTtlDays?: number;
  /**
   * Finns det ett vettigt svar utan modellen?
   *
   * Sant här betyder att slut kvot inte får bli ett fel — importen ska
   * gå igenom med en titel gissad ur filnamnet i stället för att stanna.
   */
  degradesGracefully: boolean;
}

export const AI_FEATURES: Record<AiFeatureId, AiFeatureSpec> = {
  // Djupstadning: kapitelgranser, strofform, upprepningar, PDF-skrap som
  // inte foljer nagot monster. Kraver att nagon FORSTAR texten, till
  // skillnad fran den gratis stadningen som bara ser monster.
  //
  // metered: false — den har en EGEN ranson (cleanup_month) i stallet for
  // att ata av generationerna. Kostnaden loggas anda.
  //
  // Delbar: samma rafile ger samma stadning at alla.
  text_cleanup: {
    id: "text_cleanup",
    requires: FEATURE.ADVANCED_CLEANUP,
    tier: "standard",
    promptVersion: 1,
    metered: false,
    shareable: true,
    cacheTtlDays: 365,
    degradesGracefully: false,
  },

  // Katalogisering vid import. Strukturerad utvinning ur ett smakprov.
  // Delbar: samma Gutenberg-fil ger samma svar för alla.
  work_metadata: {
    id: "work_metadata",
    requires: null,
    tier: "standard",
    promptVersion: 1,
    metered: false,
    shareable: true,
    degradesGracefully: true,
  },

  // Sex ord när ett helt verk sitter. Systemets eget påhitt, inte
  // användarens begäran — och identiskt för alla som lär sig samma verk.
  medal_title: {
    id: "medal_title",
    requires: null,
    tier: "light",
    promptVersion: 1,
    metered: false,
    shareable: true,
    degradesGracefully: true,
  },

  // Läsningen ovanpå siffrorna: vad som faktiskt gled, och vad man gör
  // åt det. Poängen och de missade orden är redan uträknade när den här
  // körs — modellen får aldrig i uppdrag att sätta betyget.
  recitation_analysis: {
    id: "recitation_analysis",
    requires: FEATURE.ADVANCED_RECITATION,
    tier: "reasoning",
    promptVersion: 1,
    metered: true,
    shareable: false,
    degradesGracefully: true,
  },

  exercises: {
    id: "exercises",
    requires: FEATURE.AI_EXERCISES,
    tier: "reasoning",
    promptVersion: 1,
    metered: true,
    shareable: true,
    cacheTtlDays: 180,
    degradesGracefully: false,
  },

  glossary: {
    id: "glossary",
    requires: FEATURE.AI_GLOSSARY,
    tier: "standard",
    promptVersion: 1,
    metered: true,
    shareable: true,
    cacheTtlDays: 365,
    degradesGracefully: false,
  },

  translation: {
    id: "translation",
    requires: FEATURE.TRANSLATION,
    tier: "standard",
    promptVersion: 1,
    metered: true,
    shareable: true,
    cacheTtlDays: 365,
    degradesGracefully: false,
  },

  explain_passage: {
    id: "explain_passage",
    requires: FEATURE.AI_GLOSSARY,
    tier: "reasoning",
    promptVersion: 1,
    metered: true,
    shareable: true,
    cacheTtlDays: 365,
    degradesGracefully: false,
  },

  // Bygger på din egen övningshistorik. Får aldrig delas.
  study_plan: {
    id: "study_plan",
    requires: FEATURE.PERSONALIZED_STUDY,
    tier: "reasoning",
    promptVersion: 1,
    metered: true,
    shareable: false,
    degradesGracefully: false,
  },

  tutor_chat: {
    id: "tutor_chat",
    requires: FEATURE.PERSONALIZED_STUDY,
    tier: "reasoning",
    promptVersion: 1,
    metered: true,
    shareable: false,
    degradesGracefully: false,
  },
};

export function aiFeature(id: AiFeatureId): AiFeatureSpec {
  const spec = AI_FEATURES[id];
  if (!spec) throw new Error(`Unknown AI feature: ${id}`);
  return spec;
}
