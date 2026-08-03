"use client";
// components/practice/useMetronome.ts
// Taktgivare byggd på Web Audio.
//
// Varför inte setInterval: JavaScripts timers är inte exakta. En metronom
// på setInterval driver hörbart ifrån sig inom en minut, och blir ojämn så
// fort webbläsaren har annat för sig. Web Audio har en egen klocka som går
// på ljudkortets samplingstakt.
//
// Mönstret är det gängse: en timer vaknar var 25:e millisekund och bokar in
// alla slag som infaller inom de närmaste 100 ms. Bokningen är exakt även
// om timern som gjorde den var slarvig.

import { useRef, useState, useCallback, useEffect } from "react";
import type { Meter } from "@/lib/meter";

const LOOKAHEAD_MS      = 25;
const SCHEDULE_AHEAD_S  = 0.1;

interface Tick {
  time:     number;
  line:     number;
  beat:     number;
  isBeat:   boolean;
  isAccent: boolean;
}

export interface MetronomeState {
  running:   boolean;
  line:      number;
  beat:      number;
  isAccent:  boolean;
  /** Ökar vid varje huvudslag — praktiskt för att trigga en puls i gränssnittet. */
  pulse:     number;
}

export function useMetronome(
  meter: Meter,
  bpm: number,
  options: {
    lineCount?: number;
    onLineChange?: (line: number) => void;
    onFinish?: () => void;
    countIn?: boolean;
  } = {}
) {
  const { lineCount = 0, onLineChange, onFinish, countIn = true } = options;

  const [state, setState] = useState<MetronomeState>({
    running: false, line: 0, beat: 0, isAccent: false, pulse: 0,
  });

  const ctxRef       = useRef<AudioContext | null>(null);
  const timerRef     = useRef<number | null>(null);
  const rafRef       = useRef<number | null>(null);
  const queueRef     = useRef<Tick[]>([]);

  const nextTimeRef  = useRef(0);
  const tickRef      = useRef(0);   // löpande tick inom raden
  const lineRef      = useRef(0);
  const countInRef   = useRef(0);   // återstående inräkningsslag

  // Håll aktuella värden tillgängliga i schemaläggaren utan att starta om den
  const meterRef = useRef(meter);
  const bpmRef   = useRef(bpm);
  const cbRef    = useRef({ onLineChange, onFinish, lineCount });
  meterRef.current = meter;
  bpmRef.current   = bpm;
  cbRef.current    = { onLineChange, onFinish, lineCount };

  // ── Ett klick ─────────────────────────────────────────────────────
  const click = useCallback(
    (time: number, kind: "accent" | "beat" | "sub") => {
      const ctx = ctxRef.current;
      if (!ctx) return;

      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      const spec = {
        accent: { freq: 1_320, peak: 0.5,  len: 0.055 },
        beat:   { freq: 880,   peak: 0.34, len: 0.045 },
        sub:    { freq: 620,   peak: 0.12, len: 0.03  },
      }[kind];

      osc.type = "triangle";
      osc.frequency.setValueAtTime(spec.freq, time);

      // Mjuk attack och avklingning — annars knäpper det
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(spec.peak, time + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + spec.len);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + spec.len + 0.01);
    },
    []
  );

  // ── Schemaläggaren ────────────────────────────────────────────────
  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const m       = meterRef.current;
    const perBeat = 1 + m.subdivisions;
    const tickDur = 60 / bpmRef.current / perBeat;

    while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const time = nextTimeRef.current;

      if (countInRef.current > 0) {
        // Inräkning: fyra tydliga slag innan texten börjar
        click(time, "accent");
        queueRef.current.push({
          time, line: -countInRef.current, beat: 0,
          isBeat: true, isAccent: true,
        });
        countInRef.current -= 1;
        nextTimeRef.current += 60 / bpmRef.current;
        continue;
      }

      const tick   = tickRef.current;
      const isBeat = tick % perBeat === 0;
      const beat   = Math.floor(tick / perBeat);
      const accent = isBeat && (m.accents[beat] ?? false);

      click(time, accent ? "accent" : isBeat ? "beat" : "sub");
      queueRef.current.push({
        time, line: lineRef.current, beat,
        isBeat, isAccent: accent,
      });

      // Nästa tick
      tickRef.current += 1;
      if (tickRef.current >= m.beatsPerLine * perBeat) {
        tickRef.current = 0;
        lineRef.current += 1;

        const { lineCount: total } = cbRef.current;
        if (total > 0 && lineRef.current >= total) {
          // Slut på texten — låt de bokade slagen spela ut, stanna sedan
          window.setTimeout(() => stop(), 400);
        }
      }

      nextTimeRef.current += tickDur;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [click]);

  // ── Visuell synk ──────────────────────────────────────────────────
  const paint = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    const now = ctx.currentTime;
    let latest: Tick | null = null;

    while (queueRef.current.length && queueRef.current[0].time <= now) {
      latest = queueRef.current.shift()!;
    }

    if (latest) {
      setState(s => {
        const lineChanged = latest!.line !== s.line;
        if (lineChanged && latest!.line >= 0) {
          cbRef.current.onLineChange?.(latest!.line);
        }
        return {
          running:  true,
          line:     latest!.line,
          beat:     latest!.beat,
          isAccent: latest!.isAccent,
          pulse:    latest!.isBeat ? s.pulse + 1 : s.pulse,
        };
      });
    }

    rafRef.current = requestAnimationFrame(paint);
  }, []);

  // ── Start och stopp ───────────────────────────────────────────────
  const start = useCallback(
    (fromLine = 0) => {
      // AudioContext får bara skapas efter en användarhandling
      if (!ctxRef.current) {
        const AC = window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new AC();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      queueRef.current   = [];
      tickRef.current    = 0;
      lineRef.current    = fromLine;
      countInRef.current = countIn ? 4 : 0;
      nextTimeRef.current = ctx.currentTime + 0.12;

      setState({ running: true, line: fromLine, beat: 0, isAccent: false, pulse: 0 });

      timerRef.current = window.setInterval(scheduler, LOOKAHEAD_MS);
      rafRef.current   = requestAnimationFrame(paint);
    },
    [scheduler, paint, countIn]
  );

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    queueRef.current = [];
    setState(s => ({ ...s, running: false }));
    cbRef.current.onFinish?.();
  }, []);

  const toggle = useCallback(
    (fromLine = 0) => {
      if (state.running) stop();
      else start(fromLine);
    },
    [state.running, start, stop]
  );

  // Städa upp
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      if (rafRef.current !== null)   cancelAnimationFrame(rafRef.current);
      void ctxRef.current?.close();
    };
  }, []);

  return { ...state, start, stop, toggle };
}
