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
const clerkAppearance = {
  variables: {
    colorPrimary:        "#C8A450",
    colorBackground:     "#13181F",
    colorText:           "#EDE5CC",
    colorTextSecondary:  "#7A8899",
    colorInputBackground:"#1A2029",
    colorInputText:      "#EDE5CC",
    colorDanger:         "#C05F72",
    colorSuccess:        "#6A9E6A",
    borderRadius:        "10px",
    fontFamily:          "'Inter', system-ui, sans-serif",
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
