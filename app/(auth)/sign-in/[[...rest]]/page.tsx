// app/(auth)/sign-in/[[...rest]]/page.tsx

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div style={{
      minHeight:      "100dvh",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "40px 20px",
      background:     "var(--bg)",
    }}>
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h1 style={{
          fontFamily:    "var(--fd)",
          fontSize:      "34px",
          fontWeight:    300,
          letterSpacing: "0.12em",
          color:         "var(--parch)",
          marginBottom:  "8px",
        }}>
          Rhap<span style={{ color: "var(--gold)" }}>sode</span>
        </h1>
        <p style={{
          fontFamily: "var(--fd)",
          fontSize:   "15px",
          fontStyle:  "italic",
          color:      "var(--muted)",
        }}>
          Carry great works within you.
        </p>
      </div>

      <SignIn />
      <p style={{ marginTop: "28px", fontSize: "12px", color: "var(--muted)" }}>
        <Link href="/legal/terms" style={{ color: "var(--muted)" }}>Terms</Link>
        <span style={{ margin: "0 8px", color: "var(--bg4)" }}>·</span>
        <Link href="/legal/privacy" style={{ color: "var(--muted)" }}>Privacy</Link>
      </p>
    </div>
  );
}
