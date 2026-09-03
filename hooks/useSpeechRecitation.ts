"use client";
// hooks/useSpeechRecitation.ts
// Tunn wrapper runt Web Speech API (SpeechRecognition).
//
// ── RÄTTAT: recitationen dog när man andades ──────────────────────────
//
// `continuous = true` betyder INTE att motorn lyssnar tills man säger
// till. Chrome avslutar sessionen av sig själv efter en stunds tystnad,
// och även efter en dryg minut oavsett. Då small `onend`, isListening
// blev falskt, och gränssnittet som villkorades på det hoppade tillbaka
// till startläget — mitt i ett framförande, med transkriptet dolt och
// utan knapp för att skicka in det man redan sagt.
//
// Det gjorde Performance Mode obrukbart för allt längre än några rader:
// en paus mellan två strofer räckte.
//
// Nu skiljer hooken på TVÅ saker som förut var samma:
//
//   wantListening — vad den som anropar har bett om. Ändras bara av
//                   start() och stop().
//   isListening   — om motorn råkar vara igång just nu.
//
// Slutar motorn medan wantListening är sant startas den om, och
// transkriptet behålls. Anroparen märker ingenting.
//
// Begränsningar värda att känna till:
// - Kräver säker kontext (HTTPS eller localhost).
// - Stöds inte i Firefox. Chrome/Edge/Safari fungerar.
// - Ger BARA text, ingen ljuddata.

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechRecitationOptions {
  lang?: string; // BCP-47, t.ex. "en-US", "sv-SE"
}

interface UseSpeechRecitationResult {
  isSupported:       boolean;
  /**
   * Platserna i transkriptet dar det blev tyst lange innan ordet kom.
   *
   * Raknat i FORSOKETS ordfoljd — index 0 ar det forsta ordet man sade.
   * lib/cue.ts oversatter sedan till originalets platser vid rattningen.
   *
   * Tystnad ar det narmaste vi kommer "det har kom inte av sig sjalvt".
   * Det ar inte samma sak som ett fel: man kan ha tvekat och anda sagt
   * ratt ord. Darfor vager det mindre an en miss — se lib/weakSpots.ts.
   */
  hesitationIndices: number[];
  /**
   * Motorns EGNA alternativ, en lista per slutgiltig bit.
   *
   * Web Speech ger flera hypoteser per yttrande. Appen las tidigare bara
   * den forsta och kastade resten — trots att servern kanner texten och
   * darfor kan avgora vilken av dem som troligen var den avsedda. Se
   * pickBestTranscript() i lib/cue.ts.
   *
   * Forsta posten i varje lista ar motorns forstahandsval, alltsa exakt
   * det `transcript` bestar av.
   *
   * Interimtexten ingar som en SISTA bit med ett enda alternativ. Den ar
   * nodvandig: Chrome hinner inte alltid gora sista frasen slutgiltig
   * innan stop(), och utan den skulle listan sakna slutet av varje
   * framforande — samma bortfall som transcript en gang hade.
   */
  chunks: string[][];
  /** Motorn är igång just nu. Kan blinka till falskt vid omstart. */
  isListening:       boolean;
  /** Vad anroparen bett om. Det här ska gränssnittet villkoras på. */
  isActive:          boolean;
  transcript:        string;
  interimTranscript: string;
  error:             string | null;
  start:             () => void;
  stop:              () => void;
  reset:             () => void;
}

// SpeechRecognition har inga officiella TS-typer i standardbiblioteket —
// `any` här är medvetet, inte en glömd typning.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionInstance = any;

/**
 * Fel där en omstart är meningslös.
 *
 * Nekad mikrofon eller saknad enhet blir inte bättre av att försöka igen
 * — det skulle bara ge en tyst evighetsloop av misslyckade starter.
 */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

/**
 * Tystnad langre an sa har raknas som en tvekan.
 *
 * Tre sekunder ar valt for att ligga klart over en vanlig andhamtning
 * och klart under den paus som betyder att man tappat texten helt. Ett
 * lagre varde hade markt varje komma.
 */
const HESITATION_MS = 3_000;

export function useSpeechRecitation(
  { lang = "en-US" }: UseSpeechRecitationOptions = {}
): UseSpeechRecitationResult {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isActive, setIsActive]       = useState(false);
  const [transcript, setTranscript]   = useState("");
  const [hesitations, setHesitations] = useState<number[]>([]);
  const [chunks, setChunks]           = useState<string[][]>([]);
  const [interim, setInterim]         = useState("");
  const [error, setError]             = useState<string | null>(null);

  const recognitionRef  = useRef<SpeechRecognitionInstance | null>(null);
  const wantListening   = useRef(false);
  const restartTimer    = useRef<number | null>(null);
  const langRef         = useRef(lang);
  langRef.current = lang;

  // Hur manga ord som redan sagts, och nar det senast kom nagot. Behovs
  // for att kunna saga VAR i forsoket pausen lag.
  const wordsSoFar   = useRef(0);
  const lastResultAt = useRef(0);

  useEffect(() => {
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  /**
   * Startar motorn.
   *
   * `keepTranscript` skiljer en omstart från en ny inspelning. Vid omstart
   * MÅSTE det man redan sagt vara kvar — annars tappar man halva
   * framförandet varje gång man tar ett andetag.
   */
  const begin = useCallback((keepTranscript: boolean) => {
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }

    // Städa bort en tidigare instans innan en ny skapas.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        /* redan stoppad */
      }
    }

    if (!keepTranscript) {
      setTranscript("");
      setInterim("");
      setError(null);
      setHesitations([]);
      setChunks([]);
      wordsSoFar.current   = 0;
      lastResultAt.current = Date.now();
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognition();
    recognition.lang           = langRef.current;
    recognition.continuous     = true;
    recognition.interimResults = true;
    /**
     * Fem hypoteser i stallet for en.
     *
     * Var tidigare osatt, alltsa 1 — motorns ovriga gissningar nadde
     * aldrig fram, aven nar det ratta ordet lag bland dem. Fem ar nog
     * for att fanga de vanliga forvaxlingarna utan att svaret blir stort;
     * over ungefar sa manga borjar de sista kandidaterna vara brus.
     */
    recognition.maxAlternatives = 5;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalChunk = "";
      let interimChunk = "";
      // Alternativen samlas per slutgiltig bit. Interimtext har inga
      // meningsfulla — den skrivs om medan man talar.
      const freshAlternatives: string[][] = [];

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript;

          const alts: string[] = [];
          for (let a = 0; a < result.length; a++) {
            const text = String(result[a]?.transcript ?? "").trim();
            if (text && !alts.includes(text)) alts.push(text);
          }
          if (alts.length > 0) freshAlternatives.push(alts);
        } else {
          interimChunk += result[0].transcript;
        }
      }

      if (freshAlternatives.length > 0) {
        setChunks(prev => [...prev, ...freshAlternatives]);
      }
      if (finalChunk) {
        const text  = finalChunk.trim();
        const words = text ? text.split(/\s+/).length : 0;
        const now   = Date.now();

        // Kom det har efter en lang tystnad? Da var det FORSTA ordet i
        // biten det som inte ville komma, och det ar den platsen som
        // markeras — inte hela biten.
        if (lastResultAt.current && now - lastResultAt.current > HESITATION_MS && words > 0) {
          const at = wordsSoFar.current;
          setHesitations(prev => (prev.includes(at) ? prev : [...prev, at]));
        }

        wordsSoFar.current  += words;
        lastResultAt.current = now;

        setTranscript(prev => `${prev}${prev ? " " : ""}${text}`);
      }
      setInterim(interimChunk);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;

      if (FATAL.has(event.error)) {
        // Ingen omstart. Att försöka igen ger bara samma svar.
        wantListening.current = false;
        setIsActive(false);
        setError(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone access was refused. Allow it in the browser and start again."
            : "No microphone was available."
        );
        return;
      }
      setError(`Recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);

      // Kärnan i rättningen: motorn slutade, men användaren har inte
      // sagt stopp. Starta om och behåll transkriptet.
      if (wantListening.current) {
        restartTimer.current = window.setTimeout(() => {
          if (wantListening.current) begin(true);
        }, 250);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      // start() kastar om en instans redan är igång. Nästa onend tar det.
    }
  }, []);

  const start = useCallback(() => {
    wantListening.current = true;
    setIsActive(true);
    setError(null);
    lastResultAt.current = Date.now();
    begin(false);
  }, [begin]);

  const stop = useCallback(() => {
    wantListening.current = false;
    setIsActive(false);

    if (restartTimer.current !== null) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* redan stoppad */
    }
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
    setHesitations([]);
    setChunks([]);
    wordsSoFar.current   = 0;
    lastResultAt.current = Date.now();
  }, []);

  // Stoppar allt om komponenten avmonteras medan den lyssnar.
  useEffect(() => {
    return () => {
      wantListening.current = false;
      if (restartTimer.current !== null) clearTimeout(restartTimer.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        /* redan stoppad */
      }
    };
  }, []);

  // Interimtexten laggs pa som en egen bit, sa att den som skickar
  // `chunks` far med slutet av det som sades.
  const chunksWithInterim = interim.trim()
    ? [...chunks, [interim.trim()]]
    : chunks;

  return {
    isSupported, isListening, isActive,
    transcript, interimTranscript: interim,
    hesitationIndices: hesitations,
    chunks: chunksWithInterim,
    error, start, stop, reset,
  };
}
