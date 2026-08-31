"use client";
// components/duels/useCountdown.ts
//
// Klockan som racknar ned till en tvekamps slut.
//
// Tva saker ar medvetna.
//
// Forsta tickan sker efter en sekund, sa forsta varde som ritas raknas
// fram direkt i useState. Utan det blinkar "—" forbi vid varje laddning.
//
// Takten foljer hur mycket som ar kvar: sista minuten tickar varje
// sekund, en kamp pa sju dagar gor det en gang i minuten. En timer som
// river om hela sidan varje sekund i sju dagar ar inte gratis, och
// ingen ser skillnaden.

import { useState, useEffect } from "react";

export interface Countdown {
  /** Millisekunder kvar. Noll nar tiden ar ute. */
  remaining: number;
  /** "4d 6h", "58m", "0:42" — grovleken foljer hur bradskande det ar. */
  label:     string;
  done:      boolean;
}

function read(endsAt: number): Countdown {
  const remaining = Math.max(0, endsAt - Date.now());
  return { remaining, label: format(remaining), done: remaining === 0 };
}

export function formatRemaining(ms: number): string {
  return format(ms);
}

function format(ms: number): string {
  if (ms <= 0) return "time's up";

  const secs  = Math.floor(ms / 1000);
  const days  = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3_600);
  const mins  = Math.floor((secs % 3_600) / 60);
  const rest  = secs % 60;

  if (days  > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins  > 0) return `${mins}m ${String(rest).padStart(2, "0")}s`;
  return `0:${String(rest).padStart(2, "0")}`;
}

export function useCountdown(endsAt: string | Date | null): Countdown {
  const end = endsAt ? new Date(endsAt).getTime() : 0;

  const [state, setState] = useState<Countdown>(() =>
    end ? read(end) : { remaining: 0, label: "—", done: true }
  );

  useEffect(() => {
    if (!end) return;

    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const next = read(end);
      setState(next);
      if (next.done) return;

      // Grovt kvar → sallan. Nara slutet → varje sekund.
      const every =
        next.remaining > 2 * 3_600_000 ? 60_000 :
        next.remaining > 120_000       ? 10_000 :
                                          1_000;
      timer = setTimeout(tick, every);
    };

    tick();
    return () => clearTimeout(timer);
  }, [end]);

  return state;
}
