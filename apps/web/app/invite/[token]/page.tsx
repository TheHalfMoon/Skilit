"use client";

import { asRecord, fetchJson } from "../../../lib/browser-envelope";

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
  | { status: "ready"; invite: Preview; viewerEmail: string | null }
  | { status: "joined"; workspaceName: string }
  | { status: "unavailable" };

function readPreview(result: Record<string, unknown>): Preview | null {
  const invite = asRecord(result.invite);
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

function readViewerEmail(result: Record<string, unknown>): string | null {
  const user = asRecord(result.user);
  if (user === null) return null;
  return typeof user.email === "string" ? user.email : null;
}

/** What a terminal invitation says, one state at a time. */
function stateSentence(state: string): string {
  if (state === "revoked") return "This invitation was revoked.";
  if (state === "expired") return "This invitation has expired.";
  if (state === "accepted") return "This invitation has already been used.";
  return "This invitation is no longer valid.";
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (token === "") {
      setState({ status: "unavailable" });
      return;
    }
    const previewOutcome = await fetchJson(
      `/api/v1/invites/${encodeURIComponent(token)}`,
      {},
      "Read the invitation",
    );
    if (!previewOutcome.ok) {
      setState({ status: "unavailable" });
      return;
    }
    const preview = readPreview(previewOutcome.result);
    if (preview === null) {
      setState({ status: "unavailable" });
      return;
    }
    // A signed-in visitor joins as themselves; an anonymous one is
    // offered an account for the invited address.
    const sessionOutcome = await fetchJson(
      "/api/v1/auth/session",
      {},
      "Read the session",
    );
    const viewerEmail = sessionOutcome.ok ? readViewerEmail(sessionOutcome.result) : null;
    setState({ status: "ready", invite: preview, viewerEmail });
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(): Promise<void> {
    if (busy !== null || state.status !== "ready") return;
    setBusy("Accepting");
    setFailure(null);
    setNotice(null);
    const init: RequestInit = { method: "POST" };
    if (state.viewerEmail === null) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify({ email: state.invite.email, password });
    }
    const outcome = await fetchJson(
      `/api/v1/invites/${encodeURIComponent(token)}/accept`,
      init,
      "Accepting",
    );
    setBusy(null);
    if (!outcome.ok) {
      setFailure({ code: outcome.code, message: outcome.message });
      return;
    }
    const workspaceName =
      typeof outcome.result.workspaceName === "string"
        ? outcome.result.workspaceName
        : state.invite.workspaceName;
    setPassword("");
    // The invitation is spent now: the page says so instead of re-reading
    // a preview that would only repeat the fact.
    setState({ status: "joined", workspaceName });
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

  if (state.status === "joined") {
    return (
      <main>
        <h1>Invitation</h1>
        <div role="status" aria-live="polite">
          <span>
            You joined <strong>{state.workspaceName}</strong>.
          </span>
        </div>
        <p>
          <a href="/workspaces">Open your workspaces</a>
        </p>
      </main>
    );
  }

  const { invite, viewerEmail } = state;
  const spendable = invite.state === "pending";
  const signedIn = viewerEmail !== null;
  const signedInAsInvited =
    viewerEmail !== null && viewerEmail.toLowerCase() === invite.email.toLowerCase();
  const signInHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;

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
          {signedIn && !signedInAsInvited ? (
            <p>
              You are signed in as <strong>{viewerEmail}</strong>, and this
              invitation is for <strong>{invite.email}</strong>. Sign in as the
              invited address to accept it.
            </p>
          ) : null}
          {!signedIn ? (
            <div>
              <label htmlFor="invite-password">Choose a password</label>
              <input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                className="sk-field-wide"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p>At least eight characters. This creates your Skilit account.</p>
            </div>
          ) : null}
          {signedInAsInvited ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void accept()}
            >
              Join this workspace
            </button>
          ) : null}
          {!signedIn ? (
            <button
              type="button"
              disabled={busy !== null || password.length < 8}
              onClick={() => void accept()}
            >
              Accept and create my account
            </button>
          ) : null}
          {!signedIn ? (
            <p>
              Already have an account? <a href={signInHref}>Sign in as {invite.email}</a>{" "}
              and then accept the invitation.
            </p>
          ) : null}
        </section>
      ) : (
        <p>{stateSentence(invite.state)}</p>
      )}
    </main>
  );
}
