"use client";

import { SessionAccessBanner } from "../../components/session-access-banner";
import { sessionRequest } from "../../lib/browser-session";

import { useEffect, useState } from "react";

interface AccountSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  live: boolean;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
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
    const { id, createdAt, expiresAt, revokedAt, live } = record as {
      id?: unknown;
      createdAt?: unknown;
      expiresAt?: unknown;
      revokedAt?: unknown;
      live?: unknown;
    };
    if (
      typeof id !== "string" ||
      typeof createdAt !== "string" ||
      typeof expiresAt !== "string" ||
      typeof live !== "boolean"
    ) {
      return null;
    }
    if (revokedAt !== null && typeof revokedAt !== "string") return null;
    out.push({
      id,
      createdAt,
      expiresAt,
      revokedAt: typeof revokedAt === "string" ? revokedAt : null,
      live,
    });
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

  async function load(): Promise<void> {
    setBusy("Load sessions");
    setFailure(null);
    try {
      const response = await sessionRequest("/api/v1/auth/sessions");
      if (response.status === 401) {
        setState({ status: "signed-out" });
        return;
      }
      const payload: unknown = await response.json();
      if (!response.ok) {
        setFailure(readFailure(payload, `Listing sessions failed with HTTP ${response.status}.`));
        setState({ status: "unavailable" });
        return;
      }
      const record = asRecord(payload);
      const result = record === null ? null : asRecord(record.result);
      if (result === null) {
        setFailure({ code: "UNKNOWN", message: "Listing sessions returned an unrecognized shape." });
        setState({ status: "unavailable" });
        return;
      }
      const sessions = asSessions(result.sessions);
      const currentSessionId = result.currentSessionId;
      if (sessions === null || typeof currentSessionId !== "string") {
        setFailure({ code: "UNKNOWN", message: "Listing sessions returned an unrecognized shape." });
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", sessions, currentSessionId });
    } catch {
      setFailure({ code: "UNKNOWN", message: "Listing sessions could not reach the server." });
      setState({ status: "unavailable" });
    } finally {
      setBusy(null);
    }
  }

  async function revoke(sessionId: string): Promise<void> {
    setBusy(`Revoke ${sessionId}`);
    setFailure(null);
    setNotice(null);
    try {
      const response = await sessionRequest(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setFailure(readFailure(payload, `Revoking the session failed with HTTP ${response.status}.`));
        return;
      }
      const record = asRecord(payload);
      const result = record === null ? null : asRecord(record.result);
      const signedOut = result !== null && result.signedOut === true;
      if (signedOut) {
        setState({ status: "signed-out" });
        setNotice("That session was this browser. You are signed out.");
        return;
      }
      setNotice("Session revoked.");
      await load();
    } catch {
      setFailure({ code: "UNKNOWN", message: "Revoking the session could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers(): Promise<void> {
    setBusy("Sign out everywhere else");
    setFailure(null);
    setNotice(null);
    try {
      const response = await sessionRequest("/api/v1/auth/sessions", { method: "DELETE" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setFailure(readFailure(payload, `Signing out failed with HTTP ${response.status}.`));
        return;
      }
      const record = asRecord(payload);
      const result = record === null ? null : asRecord(record.result);
      const revoked = result !== null && typeof result.revoked === "number" ? result.revoked : 0;
      setNotice(`Signed out ${revoked} other session(s).`);
      await load();
    } catch {
      setFailure({ code: "UNKNOWN", message: "Signing out could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

      <div role="status" aria-live="polite" style={{ minHeight: "1.5em" }}>
        {busy !== null ? <span>{busy}…</span> : null}
        {notice !== null ? <span>{notice}</span> : null}
      </div>
      {failure !== null ? (
        <div role="alert" style={{ color: "var(--sk-alert, #8c2f12)" }}>
          {failure.code}: {failure.message}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}>
        <button type="button" disabled={busy !== null} onClick={() => void load()}>
          Refresh sessions
        </button>
        <button
          type="button"
          disabled={busy !== null || state.status !== "ready"}
          onClick={() => void revokeOthers()}
        >
          Sign out of all other sessions
        </button>
      </div>

      {state.status === "loading" ? <p>Loading sessions…</p> : null}
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
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left" }}>Session</th>
              <th scope="col" style={{ textAlign: "left" }}>State</th>
              <th scope="col" style={{ textAlign: "left" }}>Started</th>
              <th scope="col" style={{ textAlign: "left" }}>Expires</th>
              <th scope="col" style={{ textAlign: "left" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
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
                    <button
                      type="button"
                      disabled={busy !== null || !session.live}
                      onClick={() => void revoke(session.id)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </main>
  );
}
