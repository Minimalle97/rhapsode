"use client";
// components/billing/DevViewSwitch.tsx
//
// DEV-markoren, som ocksa ar en vaxel.
//
// Ritas bara ut for utvecklarkonton — men det ar inte darfor den ar
// saker. Servern kontrollerar behorigheten i routen, och kakan kan anda
// bara sanka vad man ser. Att dolja knappen ar bekvamlighet; att neka i
// routen ar sakerheten.

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

export function DevViewSwitch({ viewingFree }: { viewingFree: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/dev/view", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ view: viewingFree ? "pro" : "free" }),
      });
      // Behorigheterna raknas ut pa servern, sa sidan maste hamtas om.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={
        viewingFree
          ? "You are seeing the free product. Click to go back to Pro."
          : "Developer account. Click to see the app as a free user."
      }
      style={{
        ...chip,
        borderColor: viewingFree ? "rgba(122,136,153,0.45)" : "rgba(91,139,181,0.4)",
        color:       viewingFree ? "var(--muted)" : "var(--blue)",
      }}
    >
      Dev
      <span style={{ opacity: 0.55, margin: "0 4px" }}>·</span>
      {viewingFree ? "Free" : "Pro"}
    </button>
  );
}

const chip: CSSProperties = {
  fontFamily:    "var(--fd)",
  fontSize:      "11px",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  background:    "transparent",
  border:        "1px solid",
  borderRadius:  "var(--r3)",
  padding:       "3px 9px",
  marginLeft:    "8px",
  whiteSpace:    "nowrap",
  cursor:        "pointer",
};
