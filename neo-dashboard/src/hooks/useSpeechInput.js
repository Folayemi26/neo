// src/hooks/useSpeechInput.js
//
// Browser speech-to-text for free-text fields, following the same Web Speech
// API pattern already used by ConversationalAIDialog.
//
// Voice is always an alternative to typing here, never a requirement: if the
// API is missing or the microphone is refused, `supported` is false or an
// error is reported and the caller's text input still works. A victim must
// never be blocked from sending an SOS by a denied permission prompt.

import { useCallback, useEffect, useRef, useState } from "react";

export default function useSpeechInput({ lang = "en-US", onResult } = {}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [supported, setSupported] = useState(false);

  const recognitionRef = useRef(null);
  // Held in a ref so re-creating the callback each render does not tear down
  // and rebuild the recognizer mid-utterance.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return undefined;
    }

    setSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setListening(false);
      if (onResultRef.current) onResultRef.current(transcript);
    };

    recognition.onerror = (event) => {
      setListening(false);
      setError(
        event.error === "not-allowed"
          ? "Microphone access was blocked. You can type your emergency instead."
          : "Voice input failed. You can type your emergency instead."
      );
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch (_) {
        // Already stopped; nothing to clean up.
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (_) {
      // start() throws if already running; treat that as already listening.
      setListening(true);
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch (_) {
      // Nothing to stop.
    }
    setListening(false);
  }, []);

  return { listening, error, supported, start, stop };
}
