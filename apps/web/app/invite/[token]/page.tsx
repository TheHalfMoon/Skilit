"use client";

import { sessionRequest } from "../../../lib/browser-session";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Preview {
  email: string;
  role: string;
  workspaceName: string;
  expiresAt: string;
  state: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; invite: Preview; signedIn: boolean }
  | { status: "unavailable" };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readPreview(payload: unknown): Preview | null {
  const record = asRecord(payload);
  const result = record === null ? null : asRecord(record.result);
  const invite = result === null ? null : asRecord(result.invite);
  if (invite === null) return null;
  const { email, role, workspaceName, expiresAt, state } = invite;
  if (
    typeof email !== "string" ||
    typeof role !== "string" ||
    typeof workspaceName !== "string" ||
    typeof expiresAt !== "string" ||
    typeof state !== "string"
  ) {
    return null;
  }
  return { email, role, workspaceName, expiresAt, state };
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);

  const load = useCallback(async () => {
    if (token === "") {
      setState({ status: "unavailable" });
      return;
    }
    try {
      const response = await sessionRequest(`/api/v1/invites/${encodeURIComponent(token)}`);
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setState({ status: "unavailable" });
        return;
      }
      const preview = readPreview(payload);
      if (preview === null) {
        setState({ status: "unavailable" });
        return;
      }
      // A signed-in visitor joins as themselves; an anonymous one is
      // offered an account for the invited address.
      const session = await sessionRequest("/api/v1/auth/session");
      setState({ status: "ready", invite: preview, signedIn: session.ok });
    } catch {
      setState({ status: "unavailable" });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(): Promise<void> {
    if (busy !== null || state.status !== "ready") return;
    setBusy("Accepting");
    setFailure(null);
    setNotice(null);
    try {
      const init: RequestInit = { method: "POST" };
      if (!state.signedIn) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ email: state.invite.email, password });
      }
      const response = await sessionRequest(
        `/api/v1/invites/${encodeURIComponent(token)}/accept`,
        init,
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const record = asRecord(payload);
        const error = record === null ? null : asRecord(record.error);
        setFailure({
          code: typeof error?.code === "string" ? error.code : "UNKNOWN",
          message:
            typeof error?.message === "string"
              ? error.message
              : `Accepting failed with HTTP ${response.status}.`,
        });
        return;
      }
      setNotice(`You joined ${state.invite.workspaceName}.`);
      setPassword("");
      await load();
    } catch {
      setFailure({ code: "UNKNOWN", message: "Accepting could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  if (state.status === "loading") {
    return (
      <main>
        <h1>Invitation</h1>
        <p>Loading the invitation…</p>
      </main>
    );
  }

  if (state.status === "unavailable") {
    return (
      <main>
        <h1>Invitation</h1>
        <p>
          This invitation is no longer valid. It may have been revoked, it may have
          expired, or it may have been used already.
        </p>
      </main>
    );
  }

  const { invite } = state;
  const spendable = invite.state === "pending";

  return (
    <main>
      <h1>Invitation</h1>
      <p>
        You have been invited to join <strong>{invite.workspaceName}</strong> as{" "}
        <strong>{invite.role}</strong>.
      </p>
      <p>
        The invitation is for <strong>{invite.email}</strong> and expires on{" "}
        {new Date(invite.expiresAt).toLocaleString()}.
      </p>

      <div role="status" aria-live="polite">
        {busy !== null ? <span>{busy}…</span> : null}
        {notice !== null ? <span>{notice}</span> : null}
      </div>
      {failure !== null ? (
        <div role="alert">
          {failure.code}: {failure.message}
        </div>
      ) : null}

      {spendable ? (
        <section aria-label="Accept the invitation">
          {state.signedIn ? null : (
            <div>
              <label htmlFor="invite-password">Choose a password</label>
              <input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={{ width: "100%" }}
              />
              <p>At least eight characters. This creates your Skilit account.</p>
            </div>
          )}
          <button
            type="button"
            disabled={busy !== null || (!state.signedIn && password.length < 8)}
            onClick={() => void accept()}
          >
            {state.signedIn ? "Join this workspace" : "Accept and create my account"}
          </button>
        </section>
      ) : (
        <p>This invitation is {invite.state}.</p>
      )}
    </main>
  );
}
