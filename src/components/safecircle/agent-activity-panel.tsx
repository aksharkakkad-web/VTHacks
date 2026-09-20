"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, CircleStop, Pause, Play } from "lucide-react";
import { panelSafeData, type AgentActivityEvent, type PlanningEvidence } from "@/lib/client/beacon-client";
import { AgentNetworkDiagram } from "./agent-network-diagram";

type Filter = "all" | "errors" | "agent";

function friendly(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isError(event: AgentActivityEvent) {
  return event.phase === "rejected" || event.phase === "timeout";
}

function provenance(event: AgentActivityEvent) {
  const execution = {
    live: "Live call",
    simulated: "Simulated transport",
    local_fallback: "Local fallback",
    not_called: "Not called",
  }[event.execution];
  const identity = {
    ans_verified: "ANS verified",
    local_demo: "Local demo trust",
    not_verified: "Not verified",
    not_applicable: "Identity not applicable",
  }[event.identity];
  return `${execution} · ${identity}`;
}

export function AgentActivityPanel({ events, planning }: { events: AgentActivityEvent[]; planning?: PlanningEvidence }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [paused, setPaused] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const agents = useMemo(() => [...new Set(events.flatMap((event) => [event.sender, event.recipient]))], [events]);
  const [agent, setAgent] = useState("");
  const visible = events.filter((event) => filter === "all" ? true : filter === "errors" ? isError(event) : !agent || event.sender === agent || event.recipient === agent);

  useEffect(() => {
    if (!paused) end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [events.length, paused]);

  return (
    <section className="sc-activity" aria-labelledby="agent-activity-heading">
      <div className="sc-activity-heading">
        <div><p className="sc-eyebrow">Connected evidence</p><h2 id="agent-activity-heading">Agent activity</h2></div>
        <button type="button" className="sc-activity-pause" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? "Resume scroll" : "Pause scroll"}</button>
      </div>
      <p className="sc-activity-note">Pausing only stops this panel from scrolling. Trip coordination continues on the server.</p>
      <div className="sc-source-strip" aria-label="Connected source status">
        <span><strong>Worker</strong>{planning?.worker === "not_required" ? "not required" : planning?.worker ?? "not started"}</span>
        <span><strong>Model</strong>{planning?.model ?? (planning?.modelSource === "codex_subscription" ? "Connected subscription" : "none")}</span>
        <span><strong>Explanation</strong>{planning?.explanationSource ?? "none"}</span>
      </div>

      <AgentNetworkDiagram events={events} />

      <div className="sc-activity-filters" aria-label="Activity filters">
        {(["all", "errors", "agent"] as const).map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{friendly(value)}</button>)}
        {filter === "agent" && <label><span className="sr-only">Agent</span><select value={agent} onChange={(event) => setAgent(event.target.value)}><option value="">All agents</option>{agents.map((name) => <option key={name}>{name}</option>)}</select></label>}
      </div>

      <ol className="sc-activity-list">
        {visible.map((event) => {
          const safeData = panelSafeData(event.safeData);
          return <li key={event.eventId} className={isError(event) ? "is-error" : undefined}>
          <div className="sc-activity-status" aria-hidden="true">{isError(event) ? <AlertTriangle size={15} /> : event.phase === "timeout" ? <CircleStop size={15} /> : <span />}</div>
          <div className="sc-activity-copy">
            <div><strong>{friendly(event.summaryCode)}</strong><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time></div>
            <p>{friendly(event.sender)} → {friendly(event.recipient)} · {friendly(event.operation)}</p>
            <small>{provenance(event)} · {friendly(event.phase)}</small>
            {(Object.keys(safeData).length > 0 || event.evidenceIds.length > 0) && <details><summary>Safe event data <ChevronDown size={14} /></summary><pre>{JSON.stringify({ safeData, evidenceIds: event.evidenceIds }, null, 2)}</pre></details>}
          </div>
        </li>;})}
      </ol>
      {!visible.length && <p className="sc-activity-empty">No activity matches this filter.</p>}
      <div ref={end} />
    </section>
  );
}
