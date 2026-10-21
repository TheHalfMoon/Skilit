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

/** Who the browser is, as far as the invitation surface can tell. */
type Viewer = "anonymous" | "identified" | "unavailable";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; invite: Preview; viewer: Viewer; viewerEmail: string | null }
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
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);

  const load = useCallback(async (signal: AbortSignal): Promise<void> => {
    if (token === "") {
      setState({ status: "unavailable" });
      return;
    }
    const previewOutcome = await fetchJson(
      `/api/v1/invites/${encodeURIComponent(token)}`,
      { signal },
      "Read the invitation",
    );
    if (signal.aborted) return;
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
      { signal },
      "Read the session",
    );
    if (signal.aborted) return;
    if (!sessionOutcome.ok) {
      // A refused session means nobody is signed in. Any other failure
      // means the browser cannot tell, and the page says so rather than
      // offering a form that may not work.
      setState({
        status: "ready",
        invite: preview,
        viewer: sessionOutcome.status === 401 ? "anonymous" : "unavailable",
        viewerEmail: null,
      });
      return;
    }
    setState({
      status: "ready",
      invite: preview,
      viewer: "identified",
      viewerEmail: readViewerEmail(sessionOutcome.result),
    });
  }, [token]);

  useEffect(() => {
    // The load is abandoned if the page goes away, so it neither
    // updates an unmounted page nor waits on a request nobody needs.
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function accept(): Promise<void> {
    if (busy !== null || state.status !== "ready") return;
    setBusy("Accepting");
    setFailure(null);
    const init: RequestInit = { method: "POST" };
    if (state.viewer !== "identified") {
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

  const { invite, viewer, viewerEmail } = state;
  const spendable = invite.state === "pending";
  const signedIn = viewer === "identified" && viewerEmail !== null;
  const signedInAsInvited =
    signedIn && viewerEmail.toLowerCase() === invite.email.toLowerCase();
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
      </div>
      {failure !== null ? (
        <div role="alert">
          {failure.code}: {failure.message}
        </div>
      ) : null}

      {spendable ? (
        <section aria-label="Accept the invitation">
          {viewer === "unavailable" ? (
            <p>
              This browser cannot tell whether it is signed in right now. Reload
              the page, or <a href={signInHref}>sign in again</a>.
            </p>
          ) : null}
          {signedIn && !signedInAsInvited ? (
            <p>
              You are signed in as <strong>{viewerEmail}</strong>, and this
              invitation is for <strong>{invite.email}</strong>.{" "}
              <a href={signInHref}>Sign in as {invite.email}</a> to accept it.
            </p>
          ) : null}
          {viewer === "anonymous" ? (
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
              aria-disabled={busy !== null}
              onClick={() => {
                // The guard names the same condition as the announcement,
                // so a control that is announced unavailable never acts.
                if (busy !== null) return;
                void accept();
              }}
            >
              Join this workspace
            </button>
          ) : null}
          {viewer === "anonymous" ? (
            <button
              type="button"
              aria-disabled={busy !== null || password.length < 8}
              onClick={() => {
                if (busy !== null || password.length < 8) return;
                void accept();
              }}
            >
              Accept and create my account
            </button>
          ) : null}
          {viewer === "anonymous" ? (
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
