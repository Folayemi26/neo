// src/pages/DemoNetwork.jsx
//
// The network view for the one-laptop demo. Everything rendered here comes
// from the server's recorded relay events; this component runs no animation
// timeline of its own, so what the audience sees is the actual state of the
// emergency rather than a scripted sequence.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchNetwork, resetDemo } from "../api/demoApi";
import "./DemoNetwork.css";

// The relay takes about 4 seconds end to end, so the usual 10s dashboard
// refresh would miss most of it. Poll fast while something is in flight and
// back off once the network is idle or delivered.
const POLL_ACTIVE_MS = 400;
const POLL_IDLE_MS = 2000;

const ACTIVE_STATES = ["searching", "discovered", "relaying", "forwarding"];
const DONE_STATES = ["connected", "delivered", "acked", "sent"];

function nodeModifier(state) {
  if (state === "offline") return "demoNode--offline";
  if (ACTIVE_STATES.includes(state)) return "demoNode--active";
  if (DONE_STATES.includes(state)) return "demoNode--done";
  return "";
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString([], { hour12: false });
}

export default function DemoNetwork() {
  const [network, setNetwork] = useState(null);
  const [events, setEvents] = useState([]);
  const [requestId, setRequestId] = useState(null);
  const [error, setError] = useState(null);
  const [resetting, setResetting] = useState(false);

  const logRef = useRef(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchNetwork();
      setNetwork(data.network);
      setEvents(data.events || []);
      setRequestId(data.requestId);
      setError(null);
      return data.network ? data.network.status : "idle";
    } catch (err) {
      // A backend outage should say so plainly, not blank the view.
      setError("Cannot reach the Neo server. Is it running on port 4000?");
      return "idle";
    }
  }, []);

  // Self-scheduling poll: the interval depends on what the last response said,
  // so an in-flight relay updates smoothly without polling hard forever.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const status = await load();
      if (cancelled) return;
      const settled = status === "idle" || status === "delivered";
      timerRef.current = setTimeout(tick, settled ? POLL_IDLE_MS : POLL_ACTIVE_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load]);

  // Keep the newest event in view as the relay progresses.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDemo();
      await load();
    } catch (err) {
      setError("Reset failed. Is the Neo server running?");
    } finally {
      setResetting(false);
    }
  };

  const nodes = network ? network.nodeLabels || [] : [];
  const states = network ? network.nodes || {} : {};

  return (
    <div className="demoNetwork">
      <header className="demoNetwork__header">
        <div className="demoNetwork__titleGroup">
          <h1 className="demoNetwork__title">Neo Network</h1>
          <span className="demoNetwork__badge">Demo Mode</span>
        </div>
        <button className="demoNetwork__reset" onClick={handleReset} disabled={resetting}>
          {resetting ? "Resetting..." : "Reset Demo"}
        </button>
      </header>

      {error && <div className="demoNetwork__error">{error}</div>}

      <div className="demoNetwork__topology">
        {nodes.map((node, index) => {
          const state = states[node.id] || "idle";
          const nextState = index < nodes.length - 1 ? states[nodes[index + 1].id] : null;
          const arrowLit = nextState && nextState !== "idle";

          return (
            <React.Fragment key={node.id}>
              <div className={`demoNode ${nodeModifier(state)}`}>
                <div className="demoNode__label">{node.label}</div>
                <span className="demoNode__status">{state}</span>
              </div>
              {index < nodes.length - 1 && (
                <div className={`demoNetwork__arrow ${arrowLit ? "demoNetwork__arrow--lit" : ""}`}>
                  &rarr;
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="demoNetwork__logTitle">Live Event Log</div>
      <div className="demoNetwork__log" ref={logRef}>
        {events.length === 0 ? (
          <div className="demoNetwork__empty">
            No emergency in flight. Send one from the victim view to watch it relay.
          </div>
        ) : (
          events.map((event, index) => (
            <div
              key={`${event.event}-${event.timestamp}`}
              className={`demoEvent ${index === events.length - 1 ? "demoEvent--latest" : ""}`}
            >
              <span className="demoEvent__time">{formatTime(event.timestamp)}</span>
              <span className="demoEvent__message">{event.message}</span>
              <span className="demoEvent__name">{event.event}</span>
            </div>
          ))
        )}
      </div>

      {requestId && <div className="demoNetwork__meta">Request ID: {requestId}</div>}
    </div>
  );
}
