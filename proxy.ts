// proxy.ts
//
// RÄTTAT: manifest.json och ikonerna låg bakom inloggning.
//
// Matchern släppte igenom .webmanifest men inte .json, så webbläsarens
// begäran om /manifest.json omdirigerades till inloggningssidan och gav
// 404. Det syntes i loggen som:
//
//   GET /sign-in?redirect_url=...manifest.json 404
//
// Följden var att appen inte gick att installera på hemskärmen —
// PWA-manifestet nådde aldrig fram.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  // Stripe har ingen inloggning. Routen bevisar i stället vem den kommer
  // från genom att verifiera signaturen mot STRIPE_WEBHOOK_SECRET, vilket
  // är ett starkare bevis än en session.
  "/api/billing/webhook",
  // Villkor och integritetspolicy maste ga att lasa INNAN man registrerar
  // sig. Stripe kraver att de ar oppna for att aktivera ett skarpt konto,
  // och det vore orimligt att begara ett konto for att fa veta vad man
  // gar med pa.
  "/legal(.*)",
  "/manifest.json",
  "/icon-(.*)",
  "/apple-touch-icon(.*)",
  "/favicon(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Undanta Next.js internals och statiska filer — nu även manifest.json
    "/((?!_next|manifest\\.json|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
