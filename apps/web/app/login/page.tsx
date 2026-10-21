"use client";

import Image from "next/image";

import { useCallback, useEffect, useState } from "react";

interface SessionView {
  id: string;
  email: string;
  expiresAt: string;
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

function readFailure(payload: unknown, fallback: string): AgentFailure {
  const record = asRecord(payload);
  const error = record === null ? null : asRecord(record.error);
  if (error !== null && typeof error.code === "string" && typeof error.message === "string") {
    return { code: error.code, message: error.message };
  }
  return { code: "UNKNOWN", message: fallback };
}

function asSession(result: Record<string, unknown> | null): SessionView | null {
  if (result === null) return null;
  const user = asRecord(result.user);
  if (user === null || typeof user.id !== "string" || typeof user.email !== "string") return null;
  if (typeof result.expiresAt !== "string") return null;
  return { id: user.id, email: user.email, expiresAt: result.expiresAt };
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<SessionView | null>(null);
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AgentFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/v1/auth/session");
      if (!response.ok) {
        setSession(null);
        return;
      }
      const payload: unknown = await response.json();
      setSession(asSession(asRecord(asRecord(payload)?.result)));
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/v1/auth/status");
        const payload: unknown = await response.json();
        const result = asRecord(asRecord(payload)?.result);
        setInitialized(typeof result?.initialized === "boolean" ? (result.initialized as boolean) : null);
      } catch {
        setInitialized(null);
      }
      await refreshSession();
    })();
  }, [refreshSession]);

  async function signIn(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(readFailure(payload, `Sign-in failed with HTTP ${response.status}.`));
        return;
      }
      setPassword("");
      setNotice("Signed in. Your session is held in a secure cookie, not in this page.");
      await refreshSession();
    } catch {
      setFailure({ code: "UNKNOWN", message: "Sign-in could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/signout", { method: "POST" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(readFailure(payload, `Sign-out failed with HTTP ${response.status}.`));
        return;
      }
      setSession(null);
      setNotice("Signed out. The session cookie was cleared and revoked.");
    } catch {
      setFailure({ code: "UNKNOWN", message: "Sign-out could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sk-auth-page">
      <div className="sk-auth-identity">
        <span className="sk-auth-identity-icon" aria-hidden="true">
          <Image src="/brand/skilit-mark-orange.svg" alt="" width={29} height={40} />
        </span>
        <span className="sk-auth-identity-copy">skilit / SECURE SIGN-IN</span>
      </div>
      <h1>Sign in</h1>
      <p>
        First-party browser sign-in for this Skilit installation. Sessions are
        held in a secure HttpOnly cookie; this page never stores tokens in
        browser storage.
      </p>
      {initialized === false ? (
        <p>
          No owner account exists yet. <a href="/signup">Create the first owner account</a> first.
        </p>
      ) : null}

      <section aria-label="Session status" aria-live="polite">
        <h2>Status</h2>
        {session === null ? (
          <p>No active session in this browser.</p>
        ) : (
          <div>
            <p>
              Signed in as <strong>{session.email}</strong> (expires {session.expiresAt}).
            </p>
            <button type="button" disabled={busy} onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </section>

      <section aria-label="Credentials">
        <h2>Sign in</h2>
        <form onSubmit={(event) => void signIn(event)}>
          <div>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <button type="submit" disabled={busy || email.trim() === "" || password === ""}>
            {busy ? "Working…" : "Sign in"}
          </button>
        </form>
      </section>

      <div aria-live="polite">
        {notice !== null ? <p>{notice}</p> : null}
      </div>
      {failure !== null ? (
        <p role="alert">
          Error {failure.code}: {failure.message}
        </p>
      ) : null}
    </main>
  );
}
