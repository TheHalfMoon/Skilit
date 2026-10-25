"use client";

import { SessionAccessBanner } from "../../components/session-access-banner";
import { sessionRequest } from "../../lib/browser-session";
import { versionFilterFromSearch } from "../../lib/gallery-flow-navigation";

import { useEffect, useState } from "react";

interface FlowView {
  uri: string;
  productVersionId: string;
  title: string;
  stepCount: number;
}

interface StepView {
  position: number;
  uri: string;
  kind: string;
  title: string;
  interaction: Record<string, unknown> | null;
}

interface ReplayEventView {
  type: number;
  timestamp: number;
  data: Record<string, unknown>;
}

interface AgentFailure {
  code: string;
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asFlows(value: unknown): FlowView[] | null {
  const record = asRecord(value);
  const flows = record === null ? null : record.flows;
  if (!Array.isArray(flows)) return null;
  const out: FlowView[] = [];
  for (const entry of flows) {
    const item = asRecord(entry);
    if (
      item === null ||
      typeof item.uri !== "string" ||
      typeof item.productVersionId !== "string" ||
      typeof item.title !== "string" ||
      typeof item.stepCount !== "number"
    ) {
      return null;
    }
    out.push(item as unknown as FlowView);
  }
  return out;
}

function asSteps(value: unknown): { title: string; steps: StepView[] } | null {
  const record = asRecord(value);
  if (record === null) return null;
  const flow = asRecord(record.flow);
  const steps = record.steps;
  if (flow === null || typeof flow.title !== "string" || !Array.isArray(steps)) return null;
  const out: StepView[] = [];
  for (const entry of steps) {
    const item = asRecord(entry);
    if (
      item === null ||
      typeof item.position !== "number" ||
      typeof item.uri !== "string" ||
      typeof item.kind !== "string" ||
      typeof item.title !== "string" ||
      (item.interaction !== null && asRecord(item.interaction) === null && typeof item.interaction !== "object")
    ) {
      return null;
    }
    out.push({
      position: item.position as number,
      uri: item.uri as string,
      kind: item.kind as string,
      title: item.title as string,
      interaction: (item.interaction ?? null) as Record<string, unknown> | null,
    });
  }
  return { title: flow.title as string, steps: out };
}

function asReplayEvents(value: unknown): { status: string; events: ReplayEventView[] } | null {
  const record = asRecord(value);
  if (record === null) return null;
  const session = asRecord(record.session);
  const events = record.events;
  if (session === null || typeof session.status !== "string" || !Array.isArray(events)) return null;
  const out: ReplayEventView[] = [];
  for (const entry of events) {
    const item = asRecord(entry);
    if (
      item === null ||
      typeof item.type !== "number" ||
      typeof item.timestamp !== "number" ||
      asRecord(item.data) === null
    ) {
      return null;
    }
    out.push(item as unknown as ReplayEventView);
  }
  return { status: session.status as string, events: out };
}

function cursorOf(payload: unknown): string | null {
  const record = asRecord(payload);
  if (record === null) return null;
  const cursor = record.cursor;
  return typeof cursor === "string" && cursor !== "" ? cursor : null;
}

function flowIdOf(uri: string): string {
  return uri.replace("skilit://flow/", "");
}

export default function FlowsPage() {
  const [versionFilter, setVersionFilter] = useState("");
  const [flowId, setFlowId] = useState("");
  const [flows, setFlows] = useState<FlowView[] | null>(null);
  const [flowsCursor, setFlowsCursor] = useState<string | null>(null);
  const [flowTitle, setFlowTitle] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepView[] | null>(null);
  const [at, setAt] = useState(0);
  const [replayId, setReplayId] = useState("");
  const [replayStatus, setReplayStatus] = useState<string | null>(null);
  const [replayEvents, setReplayEvents] = useState<ReplayEventView[] | null>(null);
  const [replayAt, setReplayAt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<AgentFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // From the gallery: prefill only a valid version id. The user must
    // still request the listing, and the server authorizes every result.
    const versionId = versionFilterFromSearch(window.location.search);
    if (versionId !== null) setVersionFilter(versionId);
  }, []);

  function readFailure(payload: unknown, fallback: string): AgentFailure {
    const record = asRecord(payload);
    const error = record === null ? null : asRecord(record.error);
    if (error !== null && typeof error.code === "string" && typeof error.message === "string") {
      return { code: error.code, message: error.message };
    }
    return { code: "UNKNOWN", message: fallback };
  }

  async function callJson(
    label: string,
    path: string,
    init: RequestInit,
    onOk: (result: Record<string, unknown>, payload: Record<string, unknown>) => void,
  ): Promise<void> {
    setBusy(label);
    setFailure(null);
    setNotice(null);
    try {
      const response = await sessionRequest(path, init);
      const payload: unknown = await response.json();
      if (!response.ok) {
        setFailure(readFailure(payload, `${label} failed with HTTP ${response.status}.`));
        return;
      }
      const record = asRecord(payload);
      const result = record === null ? null : asRecord(record.result);
      if (result === null || record === null) {
        setFailure({ code: "UNKNOWN", message: `${label} returned an unrecognized shape.` });
        return;
      }
      onOk(result, record);
    } catch {
      setFailure({ code: "UNKNOWN", message: `${label} could not reach the server.` });
    } finally {
      setBusy(null);
    }
  }

  async function listFlows(cursor?: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("limit", "20");
    if (versionFilter.trim() !== "") params.set("productVersionId", versionFilter.trim());
    if (cursor !== undefined && cursor !== "") params.set("cursor", cursor);
    await callJson("List flows", `/api/v1/flows?${params.toString()}`, {}, (result, payload) => {
      const list = asFlows(result);
      if (list === null) {
        setFailure({ code: "UNKNOWN", message: "List flows returned an unrecognized shape." });
        return;
      }
      setFlows((previous) => (cursor === undefined ? list : [...(previous ?? []), ...list]));
      setFlowsCursor(cursorOf(payload));
      setNotice(`Listed ${list.length} flow(s).`);
    });
  }

  async function inspectSteps(target?: string): Promise<void> {
    const id = (target ?? flowId).trim();
    if (id === "") {
      setFailure({ code: "UNKNOWN", message: "Enter a flow ID before inspecting steps." });
      return;
    }
    await callJson("Inspect steps", `/api/v1/flows/${encodeURIComponent(flowIdOf(id))}/steps`, {}, (result) => {
      const detail = asSteps(result);
      if (detail === null) {
        setFailure({ code: "UNKNOWN", message: "Inspect steps returned an unrecognized shape." });
        return;
      }
      setFlowId(flowIdOf(id));
      setFlowTitle(detail.title);
      setSteps(detail.steps);
      setAt(0);
      setNotice(`Listed ${detail.steps.length} step(s) in deterministic order.`);
    });
  }

  const current = steps === null ? null : steps[Math.min(at, steps.length - 1)] ?? null;
  const currentReplay = replayEvents === null ? null : replayEvents[Math.min(replayAt, replayEvents.length - 1)] ?? null;

  async function inspectReplay(target?: string): Promise<void> {
    const id = (target ?? replayId).trim().replace("skilit://replay/", "");
    if (id === "") {
      setFailure({ code: "UNKNOWN", message: "Enter a replay session ID before inspecting." });
      return;
    }
    await callJson("Inspect replay", `/api/v1/replays/${encodeURIComponent(id)}/events`, {}, (result) => {
      const parsed = asReplayEvents(result);
      if (parsed === null) {
        setFailure({ code: "UNKNOWN", message: "Inspect replay returned an unrecognized shape." });
        return;
      }
      setReplayId(id);
      setReplayStatus(parsed.status);
      setReplayEvents(parsed.events);
      setReplayAt(0);
      setNotice(`Listed ${parsed.events.length} replay event(s) in recorded order.`);
    });
  }

  return (
    <main>
      <h1>Flow player</h1>
      <p>
        Actor-scoped flow inspection over persisted Flow and FlowStep records.
        Steps play in stored position order; a single unreadable step denies
        the whole flow. Interactions are recorded metadata only, never
        fabricated from screenshots.
      </p>
      <SessionAccessBanner />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void listFlows();
        }}
      >
        <label htmlFor="flows-version">Product version filter</label>
        <input
          id="flows-version"
          type="text"
          autoComplete="off"
          value={versionFilter}
          onChange={(event) => setVersionFilter(event.target.value)}
        />
        <button type="submit">List flows</button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSteps(null);
          setFlowTitle(null);
          setAt(0);
          void inspectSteps();
        }}
      >
        <label htmlFor="flows-id">Flow ID</label>
        <input
          id="flows-id"
          type="text"
          autoComplete="off"
          value={flowId}
          onChange={(event) => setFlowId(event.target.value)}
        />
        <button type="submit">Inspect steps</button>
      </form>
      <div aria-live="polite">
        {busy !== null ? <p>Working: {busy}.</p> : null}
        {notice !== null ? <p>{notice}</p> : null}
      </div>
      {failure !== null ? (
        <p role="alert">
          {failure.code}: {failure.message}
        </p>
      ) : null}
      <section aria-label="Flows">
        <h2>Flows</h2>
        {flows === null ? <p>No flows listed yet.</p> : null}
        {flows !== null && flows.length === 0 ? <p>No flows in this scope.</p> : null}
        <ol>
          {(flows ?? []).map((flow) => (
            <li key={flow.uri}>
              <span>
                {flow.title} (steps {flow.stepCount})
              </span>{" "}
              <span>{flow.uri}</span>{" "}
              <button type="button" onClick={() => void inspectSteps(flowIdOf(flow.uri))}>
                Inspect steps
              </button>
            </li>
          ))}
        </ol>
        {flowsCursor !== null ? (
          <button type="button" onClick={() => void listFlows(flowsCursor)}>
            More flows
          </button>
        ) : null}
      </section>
      <section aria-label="Steps">
        <h2>Steps{flowTitle !== null ? ` — ${flowTitle}` : ""}</h2>
        {steps === null ? <p>No steps listed yet.</p> : null}
        {steps !== null && steps.length === 0 ? <p>No steps in this flow.</p> : null}
        {current !== null && steps !== null ? (
          <article aria-label={`Step ${current.position}`}>
            <p>
              Step {current.position} of {steps.length}: {current.title} ({current.kind})
            </p>
            <p>{current.uri}</p>
            <p>Interaction: {current.interaction === null ? "none recorded" : JSON.stringify(current.interaction)}</p>
            <div>
              <button type="button" disabled={at <= 0} onClick={() => setAt((value) => Math.max(0, value - 1))}>
                Previous step
              </button>{" "}
              <button
                type="button"
                disabled={at >= steps.length - 1}
                onClick={() => setAt((value) => Math.min(steps.length - 1, value + 1))}
              >
                Next step
              </button>
            </div>
          </article>
        ) : null}
        <ol>
          {(steps ?? []).map((step, index) => (
            <li key={`${step.position}-${step.uri}`}>
              <button type="button" onClick={() => setAt(index)}>
                Step {step.position}: {step.title}
              </button>
            </li>
          ))}
        </ol>
      </section>
      <section aria-label="Replay sessions">
        <h2>Replay sessions{replayStatus !== null ? ` — ${replayStatus}` : ""}</h2>
        <p>
          Consented replay events for one session, masked before storage.
          Open sessions and record events through the agent tools; inspect
          them here in recorded order.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setReplayEvents(null);
            setReplayStatus(null);
            setReplayAt(0);
            void inspectReplay();
          }}
        >
          <label htmlFor="flows-replay">Replay session ID</label>
          <input
            id="flows-replay"
            type="text"
            autoComplete="off"
            value={replayId}
            onChange={(event) => setReplayId(event.target.value)}
          />
          <button type="submit">Inspect replay</button>
        </form>
        {replayEvents === null ? <p>No replay inspected yet.</p> : null}
        {replayEvents !== null && replayEvents.length === 0 ? <p>No events in this session.</p> : null}
        {currentReplay !== null && replayEvents !== null ? (
          <article aria-label={`Replay event ${replayAt + 1}`}>
            <p>
              Event {replayAt + 1} of {replayEvents.length}: type {currentReplay.type} at {currentReplay.timestamp}
            </p>
            <p>Data: {JSON.stringify(currentReplay.data)}</p>
            <div>
              <button type="button" disabled={replayAt <= 0} onClick={() => setReplayAt((value) => Math.max(0, value - 1))}>
                Previous event
              </button>{" "}
              <button
                type="button"
                disabled={replayAt >= replayEvents.length - 1}
                onClick={() => setReplayAt((value) => Math.min(replayEvents.length - 1, value + 1))}
              >
                Next event
              </button>
            </div>
          </article>
        ) : null}
      </section>
      <p>
        Provenance: observed flow reads with deterministic position order;
        screenshots and hotspot overlays stay with artifact evidence and the
        rrweb replay surface.
      </p>
    </main>
  );
}
