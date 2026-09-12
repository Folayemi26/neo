// src/pages/DemoVictim.jsx
//
// The victim side of the one-laptop demo, at /demo/victim.
//
// Flow: home -> describe -> analyzing -> confirm -> sending -> waiting -> accepted
//
// Two rules shape this screen. An SOS must always be sendable: if Gemini is
// unavailable the analysis card shows a warning and SEND SOS still works, and
// if the microphone or geolocation is refused the emergency goes anyway.
// And the victim's own words are never replaced by the AI summary; both are
// carried through to the responder.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { analyzeEmergency, sendEmergency, fetchEmergency, resetDemo } from "../api/demoApi";
import useSpeechInput from "../hooks/useSpeechInput";
import "./DemoVictim.css";

const POLL_ACTIVE_MS = 400;
const POLL_WAITING_MS = 1500;

// Geolocation is a nice-to-have. Never let a slow or denied prompt hold up an
// emergency: resolve null and send without coordinates.
function getLocation(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    setTimeout(() => done(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => done(null),
      { timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

const PRIORITY_CLASS = {
  Critical: "vPriority--critical",
  High: "vPriority--high",
  Normal: "vPriority--normal",
};

export default function DemoVictim() {
  const [stage, setStage] = useState("home");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null); // { analysis, warning, provider }
  const [transport, setTransport] = useState(null);
  const [helpRequest, setHelpRequest] = useState(null);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);
  const textareaRef = useRef(null);

  const speech = useSpeechInput({
    onResult: (transcript) => {
      // Append rather than replace, so a second utterance adds detail.
      setText((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
    },
  });

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (stage === "describe" && textareaRef.current) textareaRef.current.focus();
  }, [stage]);

  const handleAnalyze = async () => {
    if (!text.trim()) return;
    setStage("analyzing");
    setError(null);
    try {
      const data = await analyzeEmergency(text);
      setResult(data);
      setStage("confirm");
    } catch (err) {
      // Even a total analysis outage must not trap the victim here: fall
      // through to confirm with no structured data and let them send.
      setResult({ analysis: null, warning: "AI analysis unavailable. Your message will still be sent.", provider: null });
      setStage("confirm");
    }
  };

  // Polls the relay, then keeps polling for a responder to accept.
  const startPolling = useCallback((id) => {
    const tick = async () => {
      try {
        const data = await fetchEmergency(id);
        setTransport(data.transport);
        setHelpRequest(data.helpRequest || null);
        setError(null); // a transient blip should not leave a stale banner

        const accepted = data.helpRequest && data.helpRequest.status === "accepted";
        if (accepted) {
          setStage("accepted");
          return; // journey complete; stop polling
        }

        const delivered = data.transport.status === "delivered";
        setStage(delivered ? "waiting" : "sending");
        timerRef.current = setTimeout(tick, delivered ? POLL_WAITING_MS : POLL_ACTIVE_MS);
      } catch (err) {
        setError("Lost contact with the Neo server.");
        timerRef.current = setTimeout(tick, POLL_WAITING_MS);
      }
    };
    tick();
  }, []);

  const handleSend = async () => {
    setStage("sending");
    setError(null);
    try {
      const location = await getLocation();
      const data = await sendEmergency({
        message: text,
        analysis: result ? result.analysis : undefined,
        latitude: location ? location.latitude : undefined,
        longitude: location ? location.longitude : undefined,
      });
      setTransport(data.transport);
      startPolling(data.transport.id);
    } catch (err) {
      setError("Could not reach the Neo server. Your emergency was not sent.");
      setStage("confirm");
    }
  };

  const handleStartOver = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await resetDemo();
    } catch (_) {
      // A failed reset should not strand the presenter on this screen.
    }
    setText("");
    setResult(null);
    setTransport(null);
    setHelpRequest(null);
    setError(null);
    setStage("home");
  };

  const analysis = result ? result.analysis : null;
  const latestEvent = transport && transport.events.length > 0
    ? transport.events[transport.events.length - 1]
    : null;

  return (
    <div className="demoVictim">
      <header className="demoVictim__bar">
        <div className="demoVictim__brand">
          <span className="demoVictim__dot" />
          Neo
        </div>
        <span className="demoVictim__badge">Demo Mode</span>
      </header>

      {error && <div className="demoVictim__error">{error}</div>}

      <main className="demoVictim__main">
        {stage === "home" && (
          <div className="vHome">
            <button className="vSos" onClick={() => setStage("describe")}>
              <span className="vSos__label">SOS</span>
            </button>
            <p className="vHome__caption">Request Help</p>
            <p className="vHome__sub">Tap to describe your emergency</p>
          </div>
        )}

        {stage === "describe" && (
          <div className="vPanel">
            <h1 className="vPanel__title">Describe what&rsquo;s happening</h1>
            <textarea
              ref={textareaRef}
              className="vPanel__input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type what happened, or use the microphone"
              rows={5}
            />

            <div className="vPanel__row">
              {speech.supported && (
                <button
                  className={`vMic ${speech.listening ? "vMic--live" : ""}`}
                  onClick={speech.listening ? speech.stop : speech.start}
                  aria-label={speech.listening ? "Stop recording" : "Start voice input"}
                >
                  {speech.listening ? "● Listening" : "🎙 Speak"}
                </button>
              )}
              <button className="vPrimary" onClick={handleAnalyze} disabled={!text.trim()}>
                Continue
              </button>
            </div>

            {speech.error && <p className="vNote">{speech.error}</p>}
            {!speech.supported && (
              <p className="vNote">Voice input is not available in this browser. Typing works fine.</p>
            )}
          </div>
        )}

        {stage === "analyzing" && (
          <div className="vPanel vPanel--center">
            <div className="vSpinner" />
            <h1 className="vPanel__title">Understanding emergency</h1>
            <p className="vPanel__sub">Powered by Gemini</p>
          </div>
        )}

        {stage === "confirm" && (
          <div className="vPanel">
            <h1 className="vPanel__title">Emergency detected</h1>

            {result && result.warning && (
              <div className="vWarn">
                {result.warning}
              </div>
            )}

            {analysis ? (
              <div className="vCard">
                <div className="vCard__head">
                  <span className="vCard__category">{analysis.category}</span>
                  <span className={`vPriority ${PRIORITY_CLASS[analysis.priority] || ""}`}>
                    {analysis.priority}
                  </span>
                </div>

                <p className="vCard__summary">{analysis.summary}</p>

                {analysis.needs && analysis.needs.length > 0 && (
                  <ul className="vCard__needs">
                    {analysis.needs.map((need) => (
                      <li key={need}>{need}</li>
                    ))}
                  </ul>
                )}

                {analysis.peopleAffected != null && (
                  <p className="vCard__people">{analysis.peopleAffected} people affected</p>
                )}

                <p className="vCard__provider">
                  {result.provider === "gemini" ? "Structured by Gemini" : "Structured offline (AI unavailable)"}
                </p>
              </div>
            ) : (
              <div className="vCard">
                <p className="vCard__summary">{text}</p>
              </div>
            )}

            <details className="vOriginal">
              <summary>Your original message</summary>
              <p>{text}</p>
            </details>

            <div className="vPanel__row">
              <button className="vGhost" onClick={() => setStage("describe")}>Edit</button>
              <button className="vDanger" onClick={handleSend}>Send SOS</button>
            </div>
          </div>
        )}

        {(stage === "sending" || stage === "waiting") && (
          <div className="vPanel">
            <h1 className="vPanel__title">
              {stage === "waiting" ? "Emergency delivered" : "Sending emergency"}
            </h1>
            <p className="vPanel__sub">
              {stage === "waiting"
                ? "Waiting for a responder to accept..."
                : "No direct internet connection. Relaying through nearby Neo nodes."}
            </p>

            {transport && (
              <ol className="vRelay">
                {(transport.network.nodeLabels || []).map((node) => {
                  const state = transport.network.nodes[node.id];
                  const offline = state === "offline";
                  const active = state && state !== "idle" && !offline;
                  const done = ["sent", "connected", "delivered"].includes(state);
                  return (
                    <li
                      key={node.id}
                      className={`vRelay__node ${offline ? "vRelay__node--offline" : ""} ${active ? "vRelay__node--active" : ""} ${done ? "vRelay__node--done" : ""}`}
                    >
                      <span className="vRelay__label">{node.label}</span>
                      <span className="vRelay__state">{state}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            {latestEvent && <p className="vRelay__latest">{latestEvent.message}</p>}

            {stage === "waiting" && (
              <p className="vNote">Request ID: {transport && transport.id}</p>
            )}
          </div>
        )}

        {stage === "accepted" && (
          <div className="vPanel vPanel--center">
            <div className="vCheck">✓</div>
            <h1 className="vAccepted__title">Help is coming</h1>

            {helpRequest && helpRequest.responder ? (
              <div className="vResponder">
                <p className="vResponder__name">{helpRequest.responder.name}</p>
                {helpRequest.responder.verified && (
                  <p className="vResponder__verified">✓ Verified Responder</p>
                )}
                <p className="vResponder__meta">
                  {helpRequest.responder.distanceMiles != null && `${helpRequest.responder.distanceMiles} miles away`}
                  {helpRequest.responder.distanceMiles != null && helpRequest.responder.etaMinutes != null && " · "}
                  {helpRequest.responder.etaMinutes != null && `ETA ${helpRequest.responder.etaMinutes} minutes`}
                </p>
              </div>
            ) : (
              <p className="vPanel__sub">A responder has accepted your emergency.</p>
            )}

            <button className="vGhost vGhost--spaced" onClick={handleStartOver}>
              Reset Demo
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
