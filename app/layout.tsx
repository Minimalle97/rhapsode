// app/layout.tsx
// Root layout. Klerk-temat sätts här så att inloggning, registrering och
// UserButton matchar resten av appen istället för Clerks vita standardkort.

import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rhapsode",
    template: "%s · Rhapsode",
  },
  description: "Carry great works within you.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Rhapsode",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0C1015",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Clerk-tema — speglar CSS-variablerna i globals.css
//
// RÄTTAT: variablerna hette fel och ignorerades därför tyst.
//
// Clerk 7 döpte om dem: colorText → colorForeground, colorTextSecondary →
// colorMutedForeground, colorInputBackground → colorInput och
// colorInputText → colorInputForeground. Ett okänt namn ger varken fel
// eller varning, det faller bara tillbaka på standardvärdet — och
// standardvärdet för colorInputForeground är bokstavligen "black".
//
// Följden var att man skrev svart text på nästan svart botten när man
// registrerade sig. Det gick inte att se vad man skrev.
const clerkAppearance = {
  variables: {
    colorPrimary:           "#C8A450",
    colorPrimaryForeground: "#0C1015",
    colorBackground:        "#13181F",
    colorForeground:        "#EDE5CC",
    colorMuted:             "#1A2029",
    colorMutedForeground:   "#7A8899",
    colorInput:             "#1A2029",
    colorInputForeground:   "#EDE5CC",
    // Basen Clerk härleder sina neutrala toner ur. Standard är "black",
    // vilket ger osynliga kanter och otydlig text på mörk botten.
    colorNeutral:           "#EDE5CC",
    colorBorder:            "rgba(200,164,80,0.22)",
    colorRing:              "#C8A450",
    colorShadow:            "#000000",
    colorDanger:            "#C05F72",
    colorSuccess:           "#6A9E6A",
    colorWarning:           "#C9A227",
    borderRadius:           "10px",
    fontFamily:             "'Inter', system-ui, sans-serif",
  },
  elements: {
    rootBox: { width: "100%" },
    card: {
      backgroundColor: "#13181F",
      border:          "1px solid rgba(200,164,80,0.13)",
      boxShadow:       "0 4px 24px rgba(0,0,0,0.45)",
    },
    headerTitle: {
      fontFamily:    "'Cormorant Garamond', Georgia, serif",
      fontSize:      "26px",
      fontWeight:    400,
      letterSpacing: "0.04em",
    },
    headerSubtitle: { color: "#7A8899" },
    formButtonPrimary: {
      backgroundColor: "#C8A450",
      color:           "#0C1015",
      fontWeight:      500,
      textTransform:   "none" as const,
      "&:hover":       { backgroundColor: "#A8883A" },
    },
    footerActionLink: {
      color:     "#C8A450",
      "&:hover": { color: "#A8883A" },
    },
    dividerLine: { backgroundColor: "rgba(200,164,80,0.13)" },
    dividerText: { color: "#7A8899" },
    formFieldInput: {
      backgroundColor: "#1A2029",
      border:          "1px solid rgba(200,164,80,0.13)",
      color:           "#EDE5CC",
    },
    identityPreviewEditButton: { color: "#C8A450" },
    userButtonPopoverCard: {
      backgroundColor: "#13181F",
      border:          "1px solid rgba(200,164,80,0.13)",
    },
    userButtonPopoverActionButton: { color: "#EDE5CC" },
    footer: { background: "transparent" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/sign-in"
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
