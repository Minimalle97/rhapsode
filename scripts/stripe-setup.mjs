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
// Bara reset-billing ror databasen; klienten skapas latt och kopplas ner
// i finally-blocket langst ned.
import { PrismaClient } from "@prisma/client";

let prismaClient = null;
function db() {
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

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
  // Variabeln heter STRIPE_SECRET_KEY, men det den ska innehalla ar en
  // restricted key. Namnet ar slottet, inte nyckeltypen - och det ar latt
  // att lasa som en instruktion att lagga en sk_ dar.
  if (key.startsWith("sk_")) {
    console.log("");
    console.log("  That is a secret key (sk_). It can do anything in the account.");
    console.log("  A restricted key (rk_) goes in the same variable - the name is");
    console.log("  the slot, not the key type.");
    console.log("  Developers -> API keys -> Create restricted key.");
    console.log("");
  }

  return new Stripe(key, { typescript: false });
}

/**
 * Hittar produkten, och adopterar en som redan skapats för hand.
 *
 * Skriptet känner igen sin produkt på metadata-nyckeln. En produkt som
 * klickats ihop i dashboarden har ingen sådan, så utan det här steget
 * skulle skriptet skapa en ANDRA "Rhapsode Pro" bredvid den befintliga —
 * och sedan skulle två kataloger leva parallellt utan att någon märkte
 * det förrän en kund fick fel radnamn på sin faktura.
 *
 * Därför: leta på nyckeln först, annars på namnet, och märk i så fall
 * den befintliga i stället för att skapa en ny.
 */
async function findProduct(stripe, { adopt = false } = {}) {
  const tagged = await stripe.products.search({
    query: `metadata['key']:'${PRODUCT_KEY}'`,
    limit: 1,
  });
  if (tagged.data[0]) return tagged.data[0];

  const byName = await stripe.products.list({ active: true, limit: 100 });
  const match = byName.data.find(
    p => p.name.trim().toLowerCase() === "rhapsode pro"
  );
  if (!match) return null;

  if (!adopt) return { ...match, _untagged: true };

  console.log(`  Adopting the product you created by hand: ${match.name} (${match.id})`);
  return stripe.products.update(match.id, {
    metadata: { ...match.metadata, key: PRODUCT_KEY },
  });
}

/**
 * Ett befintligt pris på produkten som stämmer i belopp, intervall och
 * valuta — men saknar lookup_key för att det skapats för hand.
 */
async function findUntaggedPrice(stripe, productId, interval) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return prices.data.find(
    p =>
      !p.lookup_key &&
      p.unit_amount === AMOUNT[interval] &&
      p.currency === CURRENCY &&
      p.recurring?.interval === interval
  ) ?? null;
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
  rows.push([
    "Product",
    !product
      ? "missing"
      : product._untagged
        ? `${product.name} (${product.id}) — created by hand, run "apply" to adopt it`
        : `${product.name} (${product.id})`,
    !!product && !product._untagged,
  ]);

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

  // Skilj pa vad "apply" kan laga och vad som maste goras i dashboarden.
  // Att skicka nagon till "apply" for en sak den inte ratar ar samre an
  // att inte foresla nagot alls.
  const failed  = rows.filter(r => !r[2]);
  if (!failed.length) {
    console.log("  Everything checks out.");
    console.log();
    return;
  }

  const fixable = failed.filter(r => /product|price|portal/i.test(r[0]));
  const manual  = failed.filter(r => !fixable.includes(r));

  if (fixable.length) {
    console.log(`  Run "npm run stripe:apply" to fix: ${fixable.map(r => r[0].trim()).join(", ")}`);
  }
  if (manual.length) {
    console.log("  Fix in the Stripe dashboard:");
    for (const [label, value] of manual) console.log(`    - ${label.trim()}: ${value}`);
  }
  console.log();
}

/**
 * Kundportalen. Skapas via API i stallet for att klickas ihop, av samma
 * skal som katalogen: den blir likadan i test och skarpt lage, och den
 * gar att lasa i en diff.
 *
 * subscription_update med bada priserna ar det som later nagon byta
 * mellan manad och ar sjalv. Utan den maste de saga upp och teckna om.
 */
async function ensurePortal(stripe, productId, priceIds) {
  const existing = await stripe.billingPortal.configurations.list({ limit: 1 });
  if (existing.data.length) {
    console.log(`  Portal exists:  ${existing.data[0].id}`);
    return;
  }

  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Rhapsode Pro" },
    features: {
      invoice_history:       { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "address", "tax_id"],
      },
      // Uppsagning vid periodens slut, inte omedelbart. Man har betalat
      // for perioden och ska fa behalla den.
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
      },
      // Later folk byta mellan manad och ar sjalva.
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [{ product: productId, prices: priceIds }],
      },
    },
  });

  console.log(`  Created portal: ${config.id}`);
}

// ── apply ─────────────────────────────────────────────────────────────
async function apply() {
  const stripe = client();

  let product = await findProduct(stripe, { adopt: true });
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
    let existing = await findPrice(stripe, LOOKUP[interval]);

    // Inget märkt pris — men kanske ett som skapats för hand och stämmer.
    // Då märks det i stället för att dubbleras.
    if (!existing) {
      const handMade = await findUntaggedPrice(stripe, product.id, interval);
      if (handMade) {
        existing = await stripe.prices.update(handMade.id, {
          lookup_key: LOOKUP[interval],
          metadata:   { ...handMade.metadata, key: PRODUCT_KEY, interval },
        });
        console.log(`  Adopted price:  ${money(existing.unit_amount)} / ${interval} — ${existing.id}`);
        out[interval] = existing.id;
        continue;
      }
    }

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

  await ensurePortal(stripe, product.id, [out.month, out.year]);

  console.log("\n  Put these in .env and in the Vercel project settings:\n");
  console.log(`  STRIPE_PRICE_PRO_MONTHLY=${out.month}`);
  console.log(`  STRIPE_PRICE_PRO_YEARLY=${out.year}\n`);
}

/**
 * Rensar kopplingarna till Stripe-objekt fran testlaget.
 *
 * Ett cus_… och ett sub_… som skapades i testlaget finns inte i det
 * skarpa — objekten ar helt atskilda. Ligger de kvar i databasen nar du
 * byter nycklar forsoker koden anvanda dem, och Stripe svarar "No such
 * customer".
 *
 * Koden laker det numera sjalv (se getOrCreateCustomer i
 * lib/billing/stripe.ts), men att stada bort dem ar anda ratt: annars
 * ser nagon ut att ha en betald prenumeration som ingen betalar for.
 *
 * Ror INTE inlosta koder eller utvecklarkonton — bara det Stripe gav.
 */
async function resetBilling(args) {
  const prisma = db();

  const rows = await prisma.user.findMany({
    where: {
      OR: [{ stripeCustomerId: { not: null } }, { stripeSubscriptionId: { not: null } }],
    },
    select: {
      username: true, plan: true, planSource: true, stripeCustomerId: true,
    },
  });

  if (!rows.length) {
    console.log("\n  Nothing to clear.\n");
    return;
  }

  console.log(`\n  ${rows.length} account(s) carry Stripe links:\n`);
  for (const r of rows) {
    console.log(`    ${r.username}  ${r.plan}/${r.planSource}  ${r.stripeCustomerId ?? "-"}`);
  }

  if (!args.includes("--yes")) {
    console.log("\n  This clears the customer and subscription ids and returns");
    console.log("  Stripe-granted plans to free. Redeemed codes and developer");
    console.log("  accounts are left alone.\n");
    console.log("  Re-run with --yes to do it.\n");
    return;
  }

  const { count } = await prisma.user.updateMany({
    where: { planSource: "stripe" },
    data: {
      plan: "free", planSource: "none", subscriptionStatus: "free",
      currentPeriodEnd: null, cancelAtPeriodEnd: false,
    },
  });

  await prisma.user.updateMany({
    where: { OR: [{ stripeCustomerId: { not: null } }, { stripeSubscriptionId: { not: null } }] },
    data:  { stripeCustomerId: null, stripeSubscriptionId: null },
  });

  // Webhook-kvittona hor till testlagets event-id:n och fyller ingen
  // funktion efter bytet.
  const events = await prisma.stripeEvent.deleteMany({});

  console.log(`\n  Cleared. ${count} account(s) returned to free, ${events.count} webhook receipt(s) removed.\n`);
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "apply") await apply();
  else if (command === "reset-billing") await resetBilling(args);
  else if (command === "verify" || command === undefined) await verify();
  else {
    console.log(
      "\n  Usage: node --env-file=.env scripts/stripe-setup.mjs <command>\n\n" +
      "    verify                 check catalogue, webhook and portal\n" +
      "    apply                  create the product and prices (idempotent)\n" +
      "    reset-billing [--yes]  clear test-mode links before going live\n"
    );
  }
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exitCode = 1;
}
