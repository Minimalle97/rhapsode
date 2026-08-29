// lib/ai/models.ts
//
// Vilken modell varje uppgift körs på, och vad den kostar.
//
// Uppgifterna är olika svåra. Att skriva en medaljtitel på sex ord är
// inte samma arbete som att lägga upp ett studiepass utifrån någons
// övningshistorik, och de ska inte kosta lika mycket. Därför tre nivåer
// i stället för en modell överallt.
//
// Varje mappning går att skriva över med en miljövariabel, så att en
// ändrad prislista eller en ny modell inte kräver en release.

export type ModelTier = "reasoning" | "standard" | "light";

/** low och medium finns för att hålla nere tankebudgeten på enkla uppgifter. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ModelSpec {
  id: string;
  /** Utelämnas för modeller som inte tar emot output_config.effort. */
  effort?: Effort;
  /** USD per miljon tokens. Samma tal som mikrodollar per token. */
  inputPerMTok:  number;
  outputPerMTok: number;
}

const CATALOGUE: Record<string, Omit<ModelSpec, "effort">> = {
  "claude-opus-5":   { id: "claude-opus-5",   inputPerMTok: 5,  outputPerMTok: 25 },
  "claude-sonnet-5": { id: "claude-sonnet-5", inputPerMTok: 2,  outputPerMTok: 10 },
  "claude-haiku-4-5":{ id: "claude-haiku-4-5",inputPerMTok: 1,  outputPerMTok: 5  },
};

/**
 * reasoning — verkligt öppna uppgifter. Studieplaner, övningar,
 *             förklaringar av svåra ställen. Här ligger värdet i Pro,
 *             och här är det dumsnålt att spara.
 *
 * standard  — strukturerad utvinning med ett givet svarsformat.
 *             Katalogisering vid import, ordlistor, översättningsstöd.
 *
 * light     — ren formulering utan resonemang. Medaljtitlar.
 *
 * Haiku 4.5 tar inte emot effort; därför saknas fältet på light.
 */
const TIERS: Record<ModelTier, ModelSpec> = {
  reasoning: { ...CATALOGUE["claude-opus-5"],    effort: "high"   },
  standard:  { ...CATALOGUE["claude-sonnet-5"],  effort: "low"    },
  light:     { ...CATALOGUE["claude-haiku-4-5"]                    },
};

const ENV_OVERRIDE: Record<ModelTier, string> = {
  reasoning: "AI_MODEL_REASONING",
  standard:  "AI_MODEL_STANDARD",
  light:     "AI_MODEL_LIGHT",
};

export function modelFor(tier: ModelTier): ModelSpec {
  const override = process.env[ENV_OVERRIDE[tier]]?.trim();
  if (override && CATALOGUE[override]) {
    return { ...CATALOGUE[override], effort: TIERS[tier].effort };
  }
  return TIERS[tier];
}

/** Prislista för en modell vi kanske inte känner igen — anta det dyraste. */
function priceOf(modelId: string): { inputPerMTok: number; outputPerMTok: number } {
  return CATALOGUE[modelId] ?? CATALOGUE["claude-opus-5"];
}

/**
 * Kostnad i mikrodollar (1 000 000 = 1 USD).
 *
 * Heltal hela vägen. Ett flyttal per rad ser oskyldigt ut tills man
 * summerar en månad och siffran inte går ihop med Anthropics faktura.
 */
export function estimateCostMicros(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = priceOf(modelId);
  return Math.round(inputTokens * p.inputPerMTok + outputTokens * p.outputPerMTok);
}

/** 12 500 → "$0.0125". Endast för interna vyer. */
export function formatMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}
