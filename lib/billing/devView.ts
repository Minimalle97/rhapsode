// lib/billing/devView.ts
//
// Lager for utvecklarkonton att se produkten som en gratisanvandare.
//
// Hela poangen med den har filen ar en enda sakerhetsegenskap:
//
//   VAXELN KAN BARA TA BORT BEHORIGHET, ALDRIG GE DEN.
//
// Kakan sager hogst "visa mig gratisversionen". Den kan inte saga "ge mig
// Pro" — det finns ingen kod som laser den i den riktningen. Och den
// laases bara alls nar kontot REDAN ar ett utvecklarkonto enligt servern,
// vilket avgors av miljovariabeln eller en inlost dev-kod, inte av nagot
// klienten skickar.
//
// Foljden: en vanlig anvandare som satter kakan for hand far exakt
// ingenting. Det varsta ett utvecklarkonto kan gora mot sig sjalvt ar att
// se mindre an det betalar for.

const COOKIE = "rhapsode_dev_view";

export type DevView = "pro" | "free";

/**
 * Vad utvecklaren valt att se.
 *
 * Returnerar "pro" nar ingenting ar valt — alltsa det normala laget, dar
 * ett utvecklarkonto har allt.
 */
export async function readDevView(): Promise<DevView> {
  try {
    // Dynamisk import: filen importeras ocksa av kod som korr utanfor en
    // request (tester), och next/headers finns bara inuti en.
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return store.get(COOKIE)?.value === "free" ? "free" : "pro";
  } catch {
    // Ingen request-kontext. Standardlaget galler.
    return "pro";
  }
}

export const DEV_VIEW_COOKIE = COOKIE;
