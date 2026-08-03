// app/(auth)/sign-up/[[...rest]]/page.tsx

import { SignUp } from "@clerk/nextjs";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
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
          Begin with a single passage.
        </p>
      </div>

      <SignUp />
    </div>
  );
}
