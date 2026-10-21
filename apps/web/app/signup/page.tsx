"use client";

import Image from "next/image";

import { useEffect, useState } from "react";

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

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AgentFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    })();
  }, []);

  async function signUp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFailure(readFailure(payload, `Sign-up failed with HTTP ${response.status}.`));
        return;
      }
      setPassword("");
      setInitialized(true);
      setNotice("Owner account created and signed in. Continue to the login page to review your session.");
    } catch {
      setFailure({ code: "UNKNOWN", message: "Sign-up could not reach the server." });
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
        <span className="sk-auth-identity-copy">skilit / FIRST OWNER SETUP</span>
      </div>
      <h1>Create the first owner account</h1>
      <p>
        Owner creation is available exactly once per installation: while no
        account exists. Afterwards sign-up closes and this installation signs
        in existing accounts only.
      </p>
      {initialized === true ? (
        <p>
          This installation already has an owner. <a href="/login">Sign in</a> instead.
        </p>
      ) : null}

      <section aria-label="Owner creation">
        <h2>First owner</h2>
        <form onSubmit={(event) => void signUp(event)}>
          <div>
            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label htmlFor="signup-password">Password (8 to 128 characters)</label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <button type="submit" disabled={busy || email.trim() === "" || password === ""}>
            {busy ? "Working…" : "Create owner account"}
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
