// lib/ai/run.ts
//
// Enda vägen till Claude i den här appen.
//
// Ordningen är medvetet vald och betyder något:
//
//   1. behörighet   — får personen alls be om det här
//   2. hastighet    — ett tak per minut, mot en skenande klient
//   3. cache        — kostar ingenting, alltså före kvoten
//   4. kvot         — atomär, tål samtidiga anrop
//   5. anropet
//   6. bokföring    — alltid, även när det gick fel
//
// Att cachen kommer före kvoten är ett val: ett svar som redan finns har
// inte kostat något, och då vore det småaktigt att dra det från någons
// fem generationer. Att kvoten kommer efter hastighetstaket är också ett
// val: den som skickar hundra anrop i sekunden ska stoppas av det
// billigaste hindret först.

import { prisma } from "@/lib/db";
import { requireFeature, type Entitlements } from "@/lib/billing/entitlements";
import { consume, release, monthWindow, slidingWindow } from "@/lib/usage/counters";
import { aiFeature, type AiFeatureId } from "./features";
import { estimateCostMicros, modelFor } from "./models";
import { callClaude, type ClaudeCall } from "@/lib/anthropic";
import { cacheKey, readCache, writeCache } from "./cache";
import { track } from "@/lib/analytics";

export class AiQuotaError extends Error {
  readonly used: number;
  readonly limit: number;
  readonly resetsAt: Date;
  constructor(used: number, limit: number, resetsAt: Date) {
    super(`Monthly allowance used (${used}/${limit})`);
    this.name = "AiQuotaError";
    this.used = used;
    this.limit = limit;
    this.resetsAt = resetsAt;
  }
}

export class AiRateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Too many requests");
    this.name = "AiRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface RunAiOptions<T> {
  userId:  string;
  ent:     Entitlements;
  feature: AiFeatureId;
  /** Allt som bestämmer svaret. Blir cachenyckel — får inte utelämna något. */
  cacheInput: unknown;
  build:  () => Omit<ClaudeCall, "tier">;
  parse:  (text: string) => T | null;
  /** Krävs för funktioner märkta degradesGracefully. */
  fallback?: () => T;
}

export interface RunAiResult<T> {
  data:     T;
  cached:   boolean;
  /** Sant när svaret kommer från fallback i stället för modellen. */
  degraded: boolean;
}

/** Tak för hela installationens modellkostnad per månad, i mikrodollar. */
function globalBudgetMicros(): number {
  const raw = Number(process.env.AI_GLOBAL_MONTHLY_BUDGET_USD ?? "");
  const usd = Number.isFinite(raw) && raw > 0 ? raw : 200;
  return Math.round(usd * 1_000_000);
}

export async function runAi<T>(opts: RunAiOptions<T>): Promise<RunAiResult<T>> {
  const spec  = aiFeature(opts.feature);
  const model = modelFor(spec.tier);
  const now   = new Date();

  // 1 ── Behörighet. Kastar FeatureLockedError.
  if (spec.requires) requireFeature(opts.ent, spec.requires);

  // 2 ── Hastighet.
  const burst = await consume(
    "ai_burst", opts.userId, opts.ent.limits.aiBurstPerMinute, slidingWindow(60, now)
  );
  if (!burst.allowed) {
    await log(opts, model.id, "blocked", 0, 0, false);
    throw new AiRateLimitError(
      Math.max(1, Math.ceil((burst.resetsAt.getTime() - now.getTime()) / 1000))
    );
  }

  // 3 ── Cache.
  const key = cacheKey({
    feature:       spec.id,
    model:         model.id,
    promptVersion: spec.promptVersion,
    input:         opts.cacheInput,
    // Delbara svar får ingen userId i nyckeln — det är hela poängen.
    ...(spec.shareable ? {} : { userId: opts.userId }),
  });

  const hit = await readCache<T>(key);
  if (hit) {
    await log(opts, model.id, "ok", 0, 0, true);
    return { data: hit.payload, cached: true, degraded: false };
  }

  // 4 ── Månadskvot.
  const month = monthWindow(now);
  let reserved = false;

  if (spec.metered) {
    const quota = await consume("ai_month", opts.userId, opts.ent.limits.aiMonthly, month);
    if (!quota.allowed) {
      await log(opts, model.id, "blocked", 0, 0, false);
      if (spec.degradesGracefully && opts.fallback) {
        return { data: opts.fallback(), cached: false, degraded: true };
      }
      throw new AiQuotaError(quota.used, quota.limit, quota.resetsAt);
    }
    reserved = true;
  } else {
    // Ometrerade anrop dras inte från någons kvot, så de behöver ett eget
    // hinder. Utan det vore de en dörr utan lås — bara sällan använd.
    const spent = await monthlySpendMicros(month.start);
    if (spent >= globalBudgetMicros()) {
      await log(opts, model.id, "blocked", 0, 0, false);
      if (spec.degradesGracefully && opts.fallback) {
        return { data: opts.fallback(), cached: false, degraded: true };
      }
      throw new AiQuotaError(spent, globalBudgetMicros(), month.expiresAt);
    }
  }

  // 5 ── Anropet.
  try {
    const call = opts.build();
    const res  = await callClaude({ ...call, tier: spec.tier });

    if (res.refused) throw new Error("The model declined this request");

    const parsed = opts.parse(res.text);
    if (parsed === null) throw new Error("Could not read the model's answer");

    await log(opts, res.model, "ok", res.inputTokens, res.outputTokens, false, res.requestId, res.cachedInputTokens);

    await writeCache(key, {
      feature: spec.id,
      model:   res.model,
      payload: parsed,
      inputTokens:  res.inputTokens,
      outputTokens: res.outputTokens,
      shared:  spec.shareable,
      ttlDays: spec.cacheTtlDays,
    });

    return { data: parsed, cached: false, degraded: false };
  } catch (err) {
    // Ett tekniskt fel får inte äta någons månadskvot. De fick inget svar.
    if (reserved) await release("ai_month", opts.userId, month).catch(() => {});
    await log(opts, model.id, "error", 0, 0, false);

    if (spec.degradesGracefully && opts.fallback) {
      return { data: opts.fallback(), cached: false, degraded: true };
    }
    throw err;
  }
}

async function monthlySpendMicros(since: Date): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({
    where:  { createdAt: { gte: since } },
    _sum:   { estimatedCostMicros: true },
  });
  return agg._sum.estimatedCostMicros ?? 0;
}

async function log<T>(
  opts: RunAiOptions<T>,
  model: string,
  status: "ok" | "error" | "blocked",
  inputTokens: number,
  outputTokens: number,
  cached: boolean,
  requestId: string | null = null,
  cachedInputTokens = 0
): Promise<void> {
  const cost = cached || status !== "ok"
    ? 0
    : estimateCostMicros(model, inputTokens, outputTokens);

  // Bokföringen får aldrig fälla anropet. En förlorad rad är illa, ett
  // femhundrasvar till användaren för att en insert strulade är värre.
  await prisma.aiUsage
    .create({
      data: {
        userId: opts.userId,
        feature: opts.feature,
        model,
        inputTokens,
        outputTokens,
        cachedInputTokens,
        estimatedCostMicros: cost,
        requestId,
        cached,
        status,
      },
    })
    .catch(() => {});

  if (status === "blocked") {
    await track("ai_blocked", opts.userId, { feature: opts.feature, plan: opts.ent.plan });
  }
}

// ── Avläsning för gränssnittet ────────────────────────────────────────

export interface AiAllowance {
  used:      number;
  limit:     number;
  remaining: number;
  resetsAt:  Date;
}

/** Vad som är kvar den här månaden. Endast metrerade anrop räknas. */
export async function aiAllowance(userId: string, ent: Entitlements): Promise<AiAllowance> {
  const month = monthWindow();
  const row = await prisma.usageCounter.findUnique({
    where: { scope_key_windowStart: { scope: "ai_month", key: userId, windowStart: month.start } },
    select: { used: true },
  });
  const used  = row?.used ?? 0;
  const limit = ent.limits.aiMonthly;
  return { used, limit, remaining: Math.max(0, limit - used), resetsAt: month.expiresAt };
}
