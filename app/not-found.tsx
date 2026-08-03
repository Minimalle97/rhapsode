// app/not-found.tsx

import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight:      "100dvh",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "24px",
      textAlign:      "center",
      background:     "var(--bg)",
    }}>
      <p style={{
        fontFamily:   "var(--fd)",
        fontSize:     "42px",
        color:        "var(--bg4)",
        marginBottom: "20px",
        lineHeight:   1,
      }}>
        ◇
      </p>

      <h1 style={{
        fontFamily:    "var(--fd)",
        fontSize:      "28px",
        fontWeight:    300,
        letterSpacing: "0.04em",
        color:         "var(--parch)",
        marginBottom:  "10px",
      }}>
        Nothing here
      </h1>

      <p style={{
        fontSize:     "14px",
        color:        "var(--muted)",
        marginBottom: "28px",
      }}>
        This page doesn&apos;t exist, or the work was removed.
      </p>

      <Link
        href="/library"
        style={{
          padding:        "10px 22px",
          borderRadius:   "var(--r3)",
          background:     "transparent",
          border:         "1px solid rgba(200,164,80,0.4)",
          color:          "var(--gold)",
          fontFamily:     "var(--fd)",
          fontSize:       "15px",
          letterSpacing:  "0.05em",
          textDecoration: "none",
        }}
      >
        Return to library
      </Link>
    </div>
  );
}
