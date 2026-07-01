"use client";
// components/rank/XPToast.tsx
// Animerad popup efter träningssession.
// Hanterar: +XP, rank-up, medalj (öppnar MedalModal vid klick), streak (Fas 7).

import { useEffect, useState } from "react";
import { MedalModal } from "@/components/medals/MedalModal";

interface XPToastProps {
  xpEarned:      number;
  newXP:         number;
  rankName:      string;
  rankUp?:       boolean;
  medal?:        { title: string; workTitle: string; author: string } | null;
  streakDays?:   number; // Fas 7
  streakBonusXP?: number; // Fas 7 — 0/undefined = ingen streak-pill visas
  onDone?:       () => void;
}

export function XPToast({
  xpEarned, newXP, rankName, rankUp, medal, streakDays, streakBonusXP, onDone,
}: XPToastProps) {
  const [visible, setVisible]     = useState(false);
  const [leaving, setLeaving]     = useState(false);
  const [showModal, setShowModal] = useState(false);

  const hasMedal  = !!medal;
  const hasStreak = !!streakBonusXP && streakBonusXP > 0;
  const delay     = (rankUp || hasMedal) ? 5000 : 3500;

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 50);
    const t2 = setTimeout(() => setLeaving(true), delay);
    const t3 = setTimeout(() => { setVisible(false); onDone?.(); }, delay + 400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [delay, onDone]);

  if (!visible && !leaving) return null;

  return (
    <>
      <div style={{
        position:      "fixed",
        bottom:        "28px",
        right:         "28px",
        zIndex:        999,
        display:       "flex",
        flexDirection: "column",
        gap:           "10px",
        pointerEvents: "none",
      }}>
        {/* XP pill */}
        <Pill color="var(--gold)" leaving={leaving} delay={0}>
          <span style={{ fontSize: "18px", fontFamily: "var(--fd)", fontWeight: 400 }}>
            +{xpEarned} XP
          </span>
          <span style={{ fontSize: "11px", color: "var(--muted)", marginLeft: "6px" }}>
            {newXP.toLocaleString()} total
          </span>
        </Pill>

        {/* Streak pill — visas bara när dagens bonus precis utdelades */}
        {hasStreak && (
          <Pill color="var(--red)" leaving={leaving} delay={120}>
            <span style={{ fontSize: "14px" }}>🔥</span>
            <span style={{ fontSize: "15px", fontFamily: "var(--fd)", marginLeft: "6px", color: "var(--parch)" }}>
              {streakDays} day streak
            </span>
            <span style={{ fontSize: "11px", color: "var(--muted)", marginLeft: "8px" }}>
              +{streakBonusXP} XP
            </span>
          </Pill>
        )}

        {/* Rank-up */}
        {rankUp && (
          <Pill color="var(--green)" leaving={leaving} delay={250}>
            <span style={{ fontSize: "12px", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--green)" }}>
              Rank achieved
            </span>
            <span style={{ fontSize: "15px", fontFamily: "var(--fd)", marginLeft: "8px", color: "var(--parch)" }}>
              {rankName}
            </span>
          </Pill>
        )}

        {/* Medal pill — klickbar */}
        {hasMedal && (
          <Pill color="var(--gold)" leaving={leaving} delay={380} onClick={() => setShowModal(true)} clickable>
            <span style={{ fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--gold)" }}>
              Medal earned
            </span>
            <span style={{ fontSize: "14px", fontFamily: "var(--fd)", marginLeft: "8px", color: "var(--parch)" }}>
              {medal!.title}
            </span>
            <span style={{ fontSize: "10px", color: "var(--muted)", marginLeft: "8px" }}>
              (tap to view)
            </span>
          </Pill>
        )}
      </div>

      {/* Medal celebration modal */}
      {showModal && medal && (
        <MedalModal
          medalTitle={medal.title}
          workTitle={medal.workTitle}
          author={medal.author}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function Pill({
  children, color, leaving, delay, onClick, clickable,
}: {
  children:  React.ReactNode;
  color:     string;
  leaving:   boolean;
  delay:     number;
  onClick?:  () => void;
  clickable?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display:       "flex",
        alignItems:    "center",
        padding:       "10px 18px",
        background:    "var(--bg2)",
        border:        `1px solid ${color}40`,
        borderLeft:    `3px solid ${color}`,
        borderRadius:  "var(--r)",
        boxShadow:     "var(--sh)",
        opacity:       leaving ? 0 : 1,
        transform:     leaving ? "translateY(8px)" : "translateY(0)",
        transition:    `opacity .35s ease ${delay}ms, transform .35s ease ${delay}ms`,
        pointerEvents: clickable ? "auto" : "none",
        cursor:        clickable ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}
