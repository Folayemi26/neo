// src/pages/DemoResponder.jsx
//
// The responder side of the one-laptop demo, at /demo/responder.
//
// Shows the emergencies that have reached the backend, each with what Gemini
// extracted and, crucially, the victim's own words underneath. The AI summary
// informs the responder; it never replaces what the person actually said.
//
// RESPOND claims the request. The server decides who wins: a second responder
// gets a 409 and this view says so rather than pretending the claim worked.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchResponderQueue, acceptRequest, resetDemo } from "../api/demoApi";
import "./DemoResponder.css";

const POLL_MS = 1500;

const PRIORITY_CLASS = {
  Critical: "rPriority--critical",
  High: "rPriority--high",
  Normal: "rPriority--normal",
};

const CARD_CLASS = {
  Critical: "rCard--critical",
  High: "rCard--high",
};

function describeMeta(request) {
  const bits = [];
  const people = request.ai && request.ai.peopleAffected;
  if (people != null) bits.push(`${people} ${people === 1 ? "person" : "people"}`);
  if (request.distanceMiles != null) bits.push(`${request.distanceMiles} miles away`);
  if (request.etaMinutes != null) bits.push(`ETA ${request.etaMinutes} min`);
  return bits.join(" · ");
}

export default function DemoResponder() {
  const [responder, setResponder] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [conflicts, setConflicts] = useState({});
  const [resetting, setResetting] = useState(false);

  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchResponderQueue();
      setResponder(data.responder);
      setRequests(data.requests);
      setError(null);
    } catch (err) {
      setError("Cannot reach the Neo server. Is it running on port 4000?");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      await load();
      if (cancelled) return;
      timerRef.current = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  const handleRespond = async (request) => {
    setBusyId(request.id);
    try {
      const result = await acceptRequest(request.id);
      if (!result.ok && result.conflict) {
        // Someone else claimed it first. Say so plainly and show the queue's
        // current truth rather than a stale optimistic state.
        const holder = result.request && result.request.responder;
        setConflicts((prev) => ({
          ...prev,
          [request.id]: holder ? `Already accepted by ${holder.name}.` : "Already accepted by another responder.",
        }));
      }
      await load();
    } catch (err) {
      setError("Could not accept the request. Is the Neo server running?");
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDemo();
      setConflicts({});
      await load();
    } catch (err) {
      setError("Reset failed. Is the Neo server running?");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="demoResponder">
      <header className="demoResponder__header">
        <div className="demoResponder__titleGroup">
          <h1 className="demoResponder__title">Incoming Emergencies</h1>
          <span className="demoResponder__badge">Demo Mode</span>
        </div>
        <button className="demoResponder__reset" onClick={handleReset} disabled={resetting}>
          {resetting ? "Resetting..." : "Reset Demo"}
        </button>
      </header>

      {responder && (
        <p className="demoResponder__who">
          Signed in as {responder.name}
          {responder.verified && <span className="demoResponder__whoVerified"> · ✓ Verified Responder</span>}
        </p>
      )}

      {error && <div className="demoResponder__error">{error}</div>}

      <div className="demoResponder__sectionTitle">
        {requests.length > 0 ? `${requests.length} active` : "Queue"}
      </div>

      {requests.length === 0 ? (
        <div className="demoResponder__empty">
          No active emergencies. Send one from the victim view.
        </div>
      ) : (
        requests.map((request) => {
          const ai = request.ai || {};
          const accepted = request.status === "accepted";
          const meta = describeMeta(request);

          return (
            <article
              key={request.id}
              className={`rCard ${CARD_CLASS[request.priority] || ""} ${accepted ? "rCard--accepted" : ""}`}
            >
              <div className="rCard__head">
                <span className="rCard__category">{request.natureOfHelp || "Help Needed"}</span>
                <span className={`rPriority ${PRIORITY_CLASS[request.priority] || ""}`}>
                  {request.priority || "Normal"}
                </span>
              </div>

              {meta && <div className="rCard__meta">{meta}</div>}

              {ai.summary && <p className="rCard__summary">{ai.summary}</p>}

              {ai.needs && ai.needs.length > 0 && (
                <ul className="rCard__needs">
                  {ai.needs.map((need) => (
                    <li key={need}>{need}</li>
                  ))}
                </ul>
              )}

              {/* The AI summary never stands in for what the victim said. */}
              <div className="rCard__original">
                <div className="rCard__originalLabel">Victim&rsquo;s own words</div>
                <p className="rCard__originalText">&ldquo;{request.message}&rdquo;</p>
              </div>

              {accepted ? (
                <div className="rCard__accepted">
                  <div className="rCard__acceptedTitle">
                    ✓ Accepted by {request.responder ? request.responder.name : "a responder"}
                  </div>
                  {request.responder && request.responder.distanceMiles != null && (
                    <div className="rCard__acceptedMeta">
                      {request.responder.distanceMiles} miles away · ETA {request.responder.etaMinutes} minutes
                    </div>
                  )}
                </div>
              ) : (
                <div className="rCard__actions">
                  <button
                    className="rRespond"
                    onClick={() => handleRespond(request)}
                    disabled={busyId === request.id}
                  >
                    {busyId === request.id ? "Accepting..." : "Respond"}
                  </button>
                </div>
              )}

              {/* Shown even once the card reads as accepted: a responder whose
                  click lost the race needs to know it was not theirs. */}
              {conflicts[request.id] && (
                <p className="rCard__conflict">{conflicts[request.id]}</p>
              )}

              <div className="rCard__id">{request.id}</div>
            </article>
          );
        })
      )}
    </div>
  );
}
