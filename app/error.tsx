"use client";
// app/error.tsx
// Fångar oväntade fel istället för att visa en helvit kraschsida.

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
        fontFamily:    "var(--fd)",
        fontSize:      "42px",
        color:         "var(--bg4)",
        marginBottom:  "20px",
        lineHeight:    1,
      }}>
        ◈
      </p>

      <h1 style={{
        fontFamily:    "var(--fd)",
        fontSize:      "28px",
        fontWeight:    300,
        letterSpacing: "0.04em",
        color:         "var(--parch)",
        marginBottom:  "10px",
      }}>
        Something broke on our side
      </h1>

      <p style={{
        fontSize:     "14px",
        color:        "var(--muted)",
        maxWidth:     "380px",
        lineHeight:   1.6,
        marginBottom: "28px",
      }}>
        Your library and progress are safe. Try again, and if this keeps
        happening, reload the page.
      </p>

      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={reset}
          style={{
            padding:       "10px 22px",
            borderRadius:  "var(--r3)",
            background:    "var(--gold)",
            border:        "1px solid var(--gold)",
            color:         "var(--bg)",
            fontSize:      "14px",
            cursor:        "pointer",
          }}
        >
          Try again
        </button>
        <Link
          href="/library"
          style={{
            padding:        "10px 22px",
            borderRadius:   "var(--r3)",
            background:     "transparent",
            border:         "1px solid var(--bord)",
            color:          "var(--muted)",
            fontSize:       "14px",
            textDecoration: "none",
          }}
        >
          Back to library
        </Link>
      </div>

      {error.digest && (
        <p style={{ marginTop: "24px", fontSize: "11px", color: "var(--bg4)" }}>
          Reference {error.digest}
        </p>
      )}
    </div>
  );
}
