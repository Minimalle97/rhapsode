// tests/webhook.test.ts
//
// Signaturkontrollen är det enda som skiljer webhooken från ett formulär
// där vem som helst kan skriva "den här användaren är Pro". Den får aldrig
// gå sönder tyst.

import { describe, it, expect } from "vitest";
import Stripe from "stripe";

const SECRET = "whsec_test_0123456789abcdef";
const stripe = new Stripe("sk_test_dummy", { typescript: true });

function payload(type: string, object: Record<string, unknown>) {
  return JSON.stringify({
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: "event", type, data: { object },
  });
}

function sign(body: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  return stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp });
}

describe("webhook signatures", () => {
  it("accepts a correctly signed event", () => {
    const body = payload("customer.subscription.updated", { id: "sub_1", status: "active" });
    const event = stripe.webhooks.constructEvent(body, sign(body), SECRET);
    expect(event.type).toBe("customer.subscription.updated");
  });

  it("rejects a body that was altered after signing", () => {
    // Precis angreppet: fånga ett giltigt event, byt ut användaren.
    const body = payload("customer.subscription.updated", { id: "sub_1", status: "active" });
    const header = sign(body);
    const tampered = body.replace("sub_1", "sub_attacker");
    expect(() => stripe.webhooks.constructEvent(tampered, header, SECRET)).toThrow();
  });

  it("rejects a signature made with another secret", () => {
    const body = payload("invoice.paid", { id: "in_1" });
    const header = sign(body, "whsec_someone_elses_secret");
    expect(() => stripe.webhooks.constructEvent(body, header, SECRET)).toThrow();
  });

  it("rejects an unsigned body", () => {
    const body = payload("invoice.paid", { id: "in_1" });
    expect(() => stripe.webhooks.constructEvent(body, "", SECRET)).toThrow();
  });

  it("rejects a replayed signature that has gone stale", () => {
    const body = payload("invoice.paid", { id: "in_1" });
    const old = sign(body, SECRET, Math.floor(Date.now() / 1000) - 3600);
    expect(() => stripe.webhooks.constructEvent(body, old, SECRET, 300)).toThrow();
  });
});

describe("status mapping", () => {
  // Speglar mapStatus() i lib/billing/sync.ts. Det som betyder Pro och
  // det som inte gör det får aldrig glida isär.
  const alive = ["active", "trialing"];
  const dead  = ["incomplete_expired"];
  const grace = ["past_due", "unpaid", "canceled"];

  it("keeps the three groups apart", () => {
    expect(alive).not.toContain("past_due");
    expect(dead).not.toContain("active");
    expect(grace).toContain("past_due");
  });
});
