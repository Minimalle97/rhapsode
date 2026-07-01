"use client";
// components/medals/MedalModal.tsx
// Celebrationvy som visas när ett nytt medalj delas ut.
// Anropas från XPToast eller direkt från practice-sidan.

import { useEffect, useState } from "react";

interface MedalModalProps {
  medalTitle: string;
  workTitle:  string;
  author:     string;
  onClose:    () => void;
}

const GLYPHS = ["✦", "⚔", "⬡", "◈", "◉", "✧", "◆", "◇"];

export function MedalModal({ medalTitle, workTitle, author, onClose }: MedalModalProps) {
  const [visible, setVisible] = useState(false);

  // Random glyph for the seal
  const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  return (
    <div
      onClick={handleClose}
      style={{
        position:       "fixed",
        inset:          0,
        zIndex:         1000,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        background:     visible ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0)",
        transition:     "background .3s ease",
        cursor:         "pointer",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:   "var(--bg2)",
          border:       "1px solid rgba(200,164,80,0.35)",
          borderRadius: "var(--r)",
          padding:      "48px 56px",
          maxWidth:     "420px",
          width:        "90%",
          textAlign:    "center",
          boxShadow:    "var(--sh), 0 0 60px rgba(200,164,80,0.08)",
          opacity:      visible ? 1 : 0,
          transform:    visible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)",
          transition:   "opacity .3s ease, transform .3s ease",
          cursor:       "default",
        }}
      >
        {/* Decorative line top */}
        <div style={{
          width:  "48px",
          height: "1px",
          background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
          margin: "0 auto 28px",
        }} />

        {/* Seal */}
        <div style={{
          width:          "72px",
          height:         "72px",
          borderRadius:   "50%",
          border:         "1px solid rgba(200,164,80,0.4)",
          background:     "var(--gold4)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       "28px",
          color:          "var(--gold)",
          margin:         "0 auto 24px",
          boxShadow:      "0 0 24px rgba(200,164,80,0.15)",
        }}>
          {glyph}
        </div>

        {/* Label */}
        <p style={{
          fontSize:      "10px",
          letterSpacing: "0.3em",
          color:         "var(--gold)",
          textTransform: "uppercase",
          marginBottom:  "12px",
        }}>
          Medal Awarded
        </p>

        {/* Medal title */}
        <h2 style={{
          fontFamily:    "var(--fd)",
          fontSize:      "28px",
          fontWeight:    400,
          color:         "var(--parch)",
          letterSpacing: "0.04em",
          lineHeight:    1.25,
          marginBottom:  "10px",
        }}>
          {medalTitle}
        </h2>

        {/* Work */}
        <p style={{
          fontSize:     "13px",
          color:        "var(--muted)",
          marginBottom: "4px",
        }}>
          {workTitle}
        </p>
        <p style={{
          fontSize:     "12px",
          color:        "var(--bg4)",
          marginBottom: "36px",
        }}>
          {author}
        </p>

        {/* Decorative line bottom */}
        <div style={{
          width:  "48px",
          height: "1px",
          background: "linear-gradient(90deg, transparent, var(--gold), transparent)",
          margin: "0 auto 32px",
        }} />

        {/* Dismiss */}
        <button
          onClick={handleClose}
          style={{
            padding:       "10px 28px",
            borderRadius:  "var(--r3)",
            background:    "transparent",
            border:        "1px solid rgba(200,164,80,0.4)",
            color:         "var(--gold)",
            fontFamily:    "var(--fd)",
            fontSize:      "15px",
            letterSpacing: "0.05em",
            cursor:        "pointer",
            transition:    "background .15s, border-color .15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background    = "var(--gold4)";
            (e.currentTarget as HTMLButtonElement).style.borderColor  = "var(--gold)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background    = "transparent";
            (e.currentTarget as HTMLButtonElement).style.borderColor  = "rgba(200,164,80,0.4)";
          }}
        >
          Receive with honour
        </button>
      </div>
    </div>
  );
}
