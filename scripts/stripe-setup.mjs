#!/usr/bin/env node
// scripts/stripe-setup.mjs
//
// Skapar produktkatalogen i Stripe, och kontrollerar att den stämmer.
//
// Varför ett skript i stället för att klicka i dashboarden: det går att
// köra igen, det går att läsa i en diff, och det ger identisk katalog i
// test och skarpt läge. Klickar man ihop den för hand får man två
// katalogar som liknar varandra, och skillnaden upptäcks i produktion.
//
// Idempotent. Prisobjekt hittas på sin `lookup_key`, så en andra körning
// skapar ingenting nytt. Priser går inte att ändra i Stripe — de är
// oföränderliga — så en ändrad summa skapar ett NYTT pris och arkiverar
// det gamla. Befintliga prenumeranter behåller sitt pris; det är
// meningen.
//
//   node --env-file=.env scripts/stripe-setup.mjs verify
//   node --env-file=.env scripts/stripe-setup.mjs apply
//
// Summorna läses ur samma miljövariabler som lib/billing/plans.ts, så
// det som visas i appen och det som dras av Stripe inte kan glida isär.

import Stripe from "stripe";

const PRODUCT_KEY = "rhapsode_pro";
const LOOKUP = {
  month: "rhapsode_pro_monthly",
  year:  "rhapsode_pro_yearly",
};

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

const CURRENCY = (process.env.BILLING_CURRENCY ?? "sek").toLowerCase();
const AMOUNT = {
  month: envInt("PRO_PRICE_MONTHLY_MINOR", 7_900),
  year:  envInt("PRO_PRICE_YEARLY_MINOR", 69_900),
};

const money = minor =>
  `${(minor / 100).toLocaleString("sv-SE")} ${CURRENCY.toUpperCase()}`;

function client() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(
      "\n  STRIPE_SECRET_KEY is not set.\n\n" +
      "  Add it to .env, then run with:  node --env-file=.env scripts/stripe-setup.mjs …\n"
    );
    process.exit(1);
  }
  if (key.startsWith("sk_live") || key.startsWith("rk_live")) {
    console.log("\n  ⚠  LIVE MODE. This writes to your real Stripe account.\n");
  }
  return new Stripe(key, { typescript: false });
}

async function findProduct(stripe) {
  const found = await stripe.products.search({
    query: `metadata['key']:'${PRODUCT_KEY}'`,
    limit: 1,
  });
  return found.data[0] ?? null;
}

async function findPrice(stripe, lookupKey) {
  const found = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return found.data[0] ?? null;
}

// ── verify ────────────────────────────────────────────────────────────
async function verify() {
  const stripe = client();
  const mode = process.env.STRIPE_SECRET_KEY.includes("_live_") ? "live" : "test";
  const rows = [];

  const product = await findProduct(stripe);
  rows.push(["Product", product ? `${product.name} (${product.id})` : "missing", !!product]);

  for (const interval of ["month", "year"]) {
    const price = await findPrice(stripe, LOOKUP[interval]);
    if (!price) {
      rows.push([`Price · ${interval}ly`, "missing", false]);
      continue;
    }
    const matches =
      price.unit_amount === AMOUNT[interval] && price.currency === CURRENCY;
    rows.push([
      `Price · ${interval}ly`,
      `${money(price.unit_amount)} — ${price.id}${matches ? "" : `  ✗ config says ${money(AMOUNT[interval])}`}`,
      matches,
    ]);

    const envName = interval === "month" ? "STRIPE_PRICE_PRO_MONTHLY" : "STRIPE_PRICE_PRO_YEARLY";
    const configured = process.env[envName];
    rows.push([
      `  ${envName}`,
      configured === price.id ? "matches" : configured ? `points at ${configured}` : "not set",
      configured === price.id,
    ]);
  }

  const hooks = await stripe.webhookEndpoints.list({ limit: 20 });
  const hook = hooks.data.find(h => h.url.includes("/api/billing/webhook"));
  rows.push([
    "Webhook endpoint",
    hook ? `${hook.url} (${hook.status})` : "none registered",
    !!hook,
  ]);

  if (hook) {
    const needed = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ];
    const listening = hook.enabled_events.includes("*")
      ? needed
      : needed.filter(e => hook.enabled_events.includes(e));
    const missing = needed.filter(e => !listening.includes(e));
    rows.push([
      "  events",
      missing.length ? `missing: ${missing.join(", ")}` : `all ${needed.length} present`,
      missing.length === 0,
    ]);
  }

  rows.push([
    "STRIPE_WEBHOOK_SECRET",
    process.env.STRIPE_WEBHOOK_SECRET ? "set" : "NOT SET — the webhook will refuse every request",
    !!process.env.STRIPE_WEBHOOK_SECRET,
  ]);

  const portal = await stripe.billingPortal.configurations.list({ limit: 1 });
  rows.push([
    "Customer portal",
    portal.data.length ? "configured" : "not configured — enable it in the dashboard",
    portal.data.length > 0,
  ]);

  rows.push([
    "Stripe Tax",
    process.env.STRIPE_AUTOMATIC_TAX === "true"
      ? "ON — confirm an active registration exists, or nothing is collected"
      : "off (safe default)",
    true,
  ]);

  console.log(`\n  Rhapsode · Stripe ${mode} mode\n`);
  for (const [label, value, ok] of rows) {
    console.log(`  ${ok ? "✓" : "✗"}  ${label.padEnd(24)} ${value}`);
  }
  console.log();

  const failed = rows.filter(r => !r[2]).length;
  if (failed) console.log(`  ${failed} thing(s) to fix. Run "apply" to create the catalogue.\n`);
}

// ── apply ─────────────────────────────────────────────────────────────
async function apply() {
  const stripe = client();

  let product = await findProduct(stripe);
  if (product) {
    console.log(`\n  Product exists: ${product.name} (${product.id})`);
  } else {
    product = await stripe.products.create({
      name: "Rhapsode Pro",
      description:
        "Unlimited works, closer analysis of what a recitation missed, " +
        "generated exercises and glossaries, and study sessions built " +
        "around the lines you keep losing.",
      metadata: { key: PRODUCT_KEY },
    });
    console.log(`\n  Created product: ${product.name} (${product.id})`);
  }

  const out = {};

  for (const interval of ["month", "year"]) {
    const existing = await findPrice(stripe, LOOKUP[interval]);

    if (existing && existing.unit_amount === AMOUNT[interval] && existing.currency === CURRENCY) {
      console.log(`  Price exists:   ${money(existing.unit_amount)} / ${interval} — ${existing.id}`);
      out[interval] = existing.id;
      continue;
    }

    if (existing) {
      // Priser är oföränderliga i Stripe. Ett ändrat belopp betyder ett
      // nytt prisobjekt; lookup_key flyttas över så att koden hittar rätt.
      // Den som redan prenumererar ligger kvar på sitt gamla pris.
      console.log(
        `  Amount changed for ${interval} (${money(existing.unit_amount)} → ${money(AMOUNT[interval])}).` +
        `\n    Existing subscribers keep the old price.`
      );
      await stripe.prices.update(existing.id, { lookup_key: null, active: false });
    }

    const price = await stripe.prices.create({
      product:     product.id,
      unit_amount: AMOUNT[interval],
      currency:    CURRENCY,
      recurring:   { interval },
      lookup_key:  LOOKUP[interval],
      // Krävs för att Stripe Tax ska kunna räkna rätt när det slås på.
      tax_behavior: "inclusive",
      metadata:    { key: PRODUCT_KEY, interval },
    });
    console.log(`  Created price:  ${money(price.unit_amount)} / ${interval} — ${price.id}`);
    out[interval] = price.id;
  }

  console.log("\n  Put these in .env and in the Vercel project settings:\n");
  console.log(`  STRIPE_PRICE_PRO_MONTHLY=${out.month}`);
  console.log(`  STRIPE_PRICE_PRO_YEARLY=${out.year}\n`);
}

const command = process.argv[2] ?? "verify";

try {
  if (command === "apply") await apply();
  else if (command === "verify") await verify();
  else {
    console.log(
      "\n  Usage: node --env-file=.env scripts/stripe-setup.mjs <verify|apply>\n\n" +
      "    verify   check the catalogue, webhook and portal against the config\n" +
      "    apply    create the product and prices (idempotent)\n"
    );
  }
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exitCode = 1;
}
