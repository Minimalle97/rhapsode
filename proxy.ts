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
