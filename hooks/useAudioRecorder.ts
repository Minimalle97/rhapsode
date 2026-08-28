"use client";
// hooks/useAudioRecorder.ts
// Fas 8: tunn wrapper runt MediaRecorder — körs PARALLELLT med
// useSpeechRecitation (SpeechRecognition ger bara text, ingen ljuddata).
// Resultatet är en lokal Blob för direkt uppspelning; uppladdning till
// Supabase Storage sker separat, bara om användaren väljer att spara.

import { useCallback, useEffect, useRef, useState } from "react";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

interface UseAudioRecorderResult {
  isSupported:  boolean;
  isRecording:  boolean;
  audioBlob:    Blob | null;
  audioUrl:     string | null;
  error:        string | null;
  start:        () => Promise<void>;
  stop:         () => void;
  reset:        () => void;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob]     = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const streamRef     = useRef<MediaStream | null>(null);

  // Måste avgöras EFTER montering. Räknades det ut under renderingen sa
  // servern "stöds inte" och webbläsaren "stöds" i samma render, vilket gav
  // ett hydreringsfel och en blinkning i recitationsläget.
  const [isSupported, setIsSupported] = useState(false);
  useEffect(() => {
    setIsSupported(
      !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
    );
  }, []);

  // Stänger av mikrofonen om komponenten avmonteras mitt i en inspelning
  // (t.ex. byter praktik-läge eller navigerar bort) — annars hänger
  // MediaStream-spåren kvar aktiva i bakgrunden, osynligt för användaren.
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    chunksRef.current = [];

    const mimeType = pickSupportedMimeType();
    if (!isSupported || !mimeType) {
      setError("Audio recording isn't supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setError("Microphone access was denied or unavailable.");
    }
  }, [audioUrl, isSupported]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const reset = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setError(null);
    chunksRef.current = [];
  }, [audioUrl]);

  return { isSupported, isRecording, audioBlob, audioUrl, error, start, stop, reset };
}
