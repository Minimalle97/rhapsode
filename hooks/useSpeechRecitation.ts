"use client";
// hooks/useSpeechRecitation.ts
// Fas 8: tunn wrapper runt Web Speech API (SpeechRecognition).
//
// Begränsningar värda att känna till:
// - Kräver en säker kontext (HTTPS eller localhost) — fungerar på Vercel-
//   deployments per default, men inte över http:// i samma nätverk.
// - Stöds inte i Firefox överhuvudtaget. Chrome/Edge/Safari fungerar.
// - Ger BARA text, ingen ljuddata — därför finns useAudioRecorder separat.

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechRecitationOptions {
  lang?: string; // BCP-47, t.ex. "en-US", "sv-SE"
}

interface UseSpeechRecitationResult {
  isSupported:       boolean;
  isListening:        boolean;
  transcript:          string; // slutgiltig text hittills
  interimTranscript:   string; // pågående, ej slutgiltig text
  error:               string | null;
  start:               () => void;
  stop:                () => void;
  reset:               () => void;
}

// SpeechRecognition har inga officiella TS-typer i standardbiblioteket —
// `any` här är medvetet, inte en glömd typning.
type SpeechRecognitionInstance = any;

export function useSpeechRecitation(
  { lang = "en-US" }: UseSpeechRecitationOptions = {}
): UseSpeechRecitationResult {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript]   = useState("");
  const [interim, setInterim]         = useState("");
  const [error, setError]             = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  // Stoppar igenkänningen om komponenten avmonteras medan den lyssnar
  // (t.ex. byter praktik-läge eller navigerar bort).
  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);


  const start = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }

    setError(null);
    setTranscript("");
    setInterim("");

    const recognition: SpeechRecognitionInstance = new SpeechRecognition();
    recognition.lang            = lang;
    recognition.continuous      = true;
    recognition.interimResults  = true;

    recognition.onresult = (event: any) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += result[0].transcript;
        else interimChunk += result[0].transcript;
      }
      if (finalChunk) setTranscript((prev) => `${prev}${prev ? " " : ""}${finalChunk.trim()}`);
      setInterim(interimChunk);
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") return; // vanligt, inte värt att larma om
      setError(`Recognition error: ${event.error}`);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [lang]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { isSupported, isListening, transcript, interimTranscript: interim, error, start, stop, reset };
}
