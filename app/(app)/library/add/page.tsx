// app/(app)/library/add/page.tsx

import Link from "next/link";
import { AddWorkForm } from "@/components/library/AddWorkForm";

export const metadata = { title: "Add a work" };

export default function AddWorkPage() {
  return (
    <div style={{ maxWidth: "660px", margin: "0 auto", padding: "36px 24px 80px" }}>
      <Link
        href="/library"
        style={{
          fontSize:       "13px",
          color:          "var(--muted)",
          textDecoration: "none",
          display:        "inline-block",
          marginBottom:   "24px",
        }}
      >
        ← Library
      </Link>

      <h1 style={{
        fontFamily:    "var(--fd)",
        fontSize:      "32px",
        fontWeight:    300,
        letterSpacing: "0.05em",
        color:         "var(--parch)",
        marginBottom:  "8px",
      }}>
        Add a work
      </h1>
      <p style={{
        fontSize:     "14px",
        color:        "var(--muted)",
        lineHeight:   1.65,
        marginBottom: "30px",
      }}>
        Upload a file or paste the text. It gets split into sections sized for
        memorising, and the text is kept exactly as written.
      </p>

      <AddWorkForm />
    </div>
  );
}
