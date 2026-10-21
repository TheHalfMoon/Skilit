"use client";

import { SessionAccessBanner } from "../../components/session-access-banner";
import { sessionRequest } from "../../lib/browser-session";

import { useCallback, useEffect, useState } from "react";

interface AccountSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  live: boolean;
}

type LoadState =
  | { status: "idle" }
  | { status: "ready"; sessions: AccountSession[]; currentSessionId: string }
  | { status: "signed-out" }
  | { status: "unavailable" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asSessions(value: unknown): AccountSession[] | null {
  if (!Array.isArray(value)) return null;
  const out: AccountSession[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record === null) return null;
    const { id, createdAt, expiresAt, revokedAt, live } = record;
    if (
      typeof id !== "string" ||
      typeof createdAt !== "string" ||
      typeof expiresAt !== "string" ||
      typeof live !== "boolean"
    ) {
      return null;
    }
    if (revokedAt !== null && typeof revokedAt !== "string") return null;
    out.push({ id, createdAt, expiresAt, revokedAt, live });
  }
  return out;
}

function readFailure(payload: unknown, fallback: string): { code: string; message: string } {
  const record = asRecord(payload);
  const error = record === null ? null : asRecord(record.error);
  if (error === null) return { code: "UNKNOWN", message: fallback };
  const code = typeof error.code === "string" ? error.code : "UNKNOWN";
  const message = typeof error.message === "string" ? error.message : fallback;
  return { code, message };
}

function describe(session: AccountSession, current: boolean): string {
  if (session.revokedAt !== null) return "Revoked";
  if (!session.live) return "Expired";
  return current ? "This browser" : "Signed in";
}

export default function AccountPage() {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);

  /**
   * One request, one place that turns a response into either a result or
   * a failure. The notice is deliberately not cleared here: the revoke
   * actions set it and then reload, and the reload must not swallow it.
   */
  const callJson = useCallback(
    async (
      label: string,
      path: string,
      init: RequestInit,
      onOk: (result: Record<string, unknown>) => void | Promise<void>,
      onFailed?: (status: number | undefined) => void | Promise<void>,
    ): Promise<void> => {
      setBusy(label);
      setFailure(null);
      try {
        const response = await sessionRequest(path, init);
        if (response.status === 401) {
          // The credential was refused, so this browser has no account
          // surface left to show.
          setState({ status: "signed-out" });
          return;
        }
        // A proxy can answer with a body that is not JSON, so the parse
        // is guarded: the HTTP status is what the failure message
        // reports.
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setFailure(readFailure(payload, `${label} failed with HTTP ${response.status}.`));
          if (onFailed !== undefined) await onFailed(response.status);
          return;
        }
        const record = asRecord(payload);
        const result = record === null ? null : asRecord(record.result);
        if (result === null) {
          setFailure({ code: "UNKNOWN", message: `${label} returned an unrecognized shape.` });
          return;
        }
        await onOk(result);
      } catch {
        if (init.signal?.aborted !== true) {
          setFailure({ code: "UNKNOWN", message: `${label} could not reach the server.` });
          // A request that never completed is a failure like any other:
          // the page must not keep a stale table on screen next to it.
          if (onFailed !== undefined) await onFailed(undefined);
        }
      } finally {
        if (init.signal?.aborted !== true) setBusy(null);
      }
    },
    [],
  );

  const load = useCallback(
    (signal?: AbortSignal): Promise<void> =>
      callJson(
        "Load sessions",
        "/api/v1/auth/sessions",
        signal === undefined ? {} : { signal },
        (result) => {
          const sessions = asSessions(result.sessions);
          const currentSessionId = result.currentSessionId;
          if (sessions === null || typeof currentSessionId !== "string") {
            setFailure({
              code: "UNKNOWN",
              message: "Listing sessions returned an unrecognized shape.",
            });
            setState({ status: "unavailable" });
            return;
          }
          setState({ status: "ready", sessions, currentSessionId });
        },
        // A list that could not be loaded is not a stale table next to an
        // error: the page says the sessions are unavailable.
        () => {
          setState({ status: "unavailable" });
        },
      ),
    [callJson],
  );

  function revoke(sessionId: string): Promise<void> {
    setNotice(null);
    return callJson(
      `Revoke ${sessionId}`,
      `/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE" },
      async (result) => {
        if (result.signedOut === true) {
          setState({ status: "signed-out" });
          setNotice("That session was this browser. You are signed out.");
          return;
        }
        setNotice("Session revoked.");
        await load();
      },
      async (status) => {
        if (status !== 404) return;
        // The server says the session is not there any more, which is
        // what the user asked for, not a failure.
        setFailure(null);
        setNotice("That session is no longer listed.");
        await load();
      },
    );
  }

  function revokeOthers(): Promise<void> {
    setNotice(null);
    return callJson(
      "Sign out everywhere else",
      "/api/v1/auth/sessions",
      { method: "DELETE" },
      async (result) => {
        const revoked = typeof result.revoked === "number" ? result.revoked : 0;
        setNotice(`Signed out ${revoked} other session(s).`);
        await load();
      },
    );
  }

  useEffect(() => {
    // The first load is abandoned if the page goes away, so it neither
    // updates an unmounted page nor waits on a request nobody needs.
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const sessions = state.status === "ready" ? state.sessions : [];
  const currentSessionId = state.status === "ready" ? state.currentSessionId : "";

  return (
    <main>
      <h1>Account</h1>
      <p>
        Sessions that can sign in to this account. Revoking one locks that browser out
        immediately; signing out everywhere else keeps only this browser signed in.
      </p>
      <SessionAccessBanner />

      <div role="status" aria-live="polite">
        {busy !== null ? <span>{busy}…</span> : null}
        {notice !== null ? <span>{notice}</span> : null}
      </div>
      {failure !== null ? (
        <div role="alert">
          {failure.code}: {failure.message}
        </div>
      ) : null}

      <div className="sk-account-actions">
        <button
          type="button"
          aria-disabled={busy !== null}
          onClick={() => {
            if (busy !== null) return;
            setNotice(null);
            void load();
          }}
        >
          Refresh sessions
        </button>
        <button
          type="button"
          aria-disabled={busy !== null || state.status !== "ready"}
          onClick={() => {
            // The guard matches what the button announces, so a control
            // that is announced as unavailable never acts.
            if (busy !== null || state.status !== "ready") return;
            void revokeOthers();
          }}
        >
          Sign out of all other sessions
        </button>
      </div>

      {state.status === "signed-out" ? (
        <p>
          You are signed out. <a href="/login">Sign in</a> to manage sessions.
        </p>
      ) : null}
      {state.status === "unavailable" ? <p>Sessions are unavailable right now.</p> : null}
      {state.status === "ready" && sessions.length === 0 ? (
        <p>No sessions are recorded for this account.</p>
      ) : null}
      {state.status === "ready" && sessions.length > 0 ? (
        <section>
          <table className="sk-account-table">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">State</th>
                <th scope="col">Started</th>
                <th scope="col">Expires</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const isCurrent = session.id === currentSessionId;
                const unavailable = busy !== null || !session.live;
                return (
                  <tr key={session.id}>
                    <td>
                      <code>{session.id}</code>
                      {isCurrent ? <span> (this browser)</span> : null}
                    </td>
                    <td>{describe(session, isCurrent)}</td>
                    <td>{new Date(session.createdAt).toLocaleString()}</td>
                    <td>{new Date(session.expiresAt).toLocaleString()}</td>
                    <td>
                      {/* The button is marked unavailable rather than
                          disabled, so that a keyboard user who is on it
                          when it becomes unavailable does not lose their
                          place in the table. */}
                      <button
                        type="button"
                        aria-label={`Revoke session ${session.id}`}
                        aria-disabled={unavailable}
                        onClick={() => {
                          if (unavailable) return;
                          void revoke(session.id);
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
