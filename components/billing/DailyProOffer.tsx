"use client";
// components/billing/DailyProOffer.tsx
//
// Erbjudandet man moter nar man oppnar appen, hogst en gang per dag.
//
// Placeringen ar hela poangen. Det star pa Today, OVANFOR kon — alltsa
// innan man borjat, medan man fortfarande bestammer vad man ska gora.
// Mitt i ett ovningspass hade samma ruta varit ett avbrott; har ar den
// bara en av sakerna pa sidan.
//
// En gang per dag, och stangd ar stangd for det dygnet. Rakningen ligger
// i localStorage: det ar en bekvamlighet for den som tittar, inte nagot
// vi behover veta, sa det finns ingen anledning att spara det pa servern.

import { useEffect, useState } from "react";
import { UpgradeCard } from "./UpgradeCard";

const KEY = "rhapsode.proOffer.lastShown";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function DailyProOffer() {
  // Borjar dolt och visas forst efter monteringen. Servern vet inte vad
  // som star i webblasarens lagring, och att gissa ger en blinkning.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) !== today()) setShow(true);
    } catch {
      // Privat lage, blockerad lagring. Da visas den inte — hellre det
      // an en ruta som kommer tillbaka vid varje sidladdning.
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(KEY, today());
    } catch {
      /* ignoreras med flit */
    }
  }

  if (!show) return null;

  return (
    <div style={{ position: "relative", marginBottom: "22px" }}>
      <UpgradeCard
        feature="DAILY_OFFER"
        title="A harder practice than repetition"
        body="Pro reads what your recitation actually missed and builds a session from it, turns a passage into exercises and a glossary, and keeps the fuller record of how the work is going. The texts and the reciting stay free, as they are."
      />

      <button
        onClick={dismiss}
        aria-label="Dismiss for today"
        style={{
          position:   "absolute",
          top:        "12px",
          right:      "14px",
          background: "transparent",
          border:     "none",
          color:      "var(--muted)",
          fontSize:   "16px",
          lineHeight: 1,
          cursor:     "pointer",
          padding:    "4px 6px",
        }}
      >
        ×
      </button>
    </div>
  );
}
