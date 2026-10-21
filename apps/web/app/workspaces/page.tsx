"use client";

import { SessionAccessBanner } from "../../components/session-access-banner";
import { WorkspaceSelector } from "../../components/workspace-selector";
import { asRecord, fetchJson } from "../../lib/browser-envelope";

import { useCallback, useEffect, useRef, useState } from "react";

interface Member {
  workspaceId: string;
  userId: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  state: string;
  createdAt: string;
}

type ViewStatus =
  | "idle"
  | "loading"
  | "ready"
  | "denied"
  | "unavailable"
  | "signed-out";

type InviteStatus = "hidden" | "loading" | "ready" | "unavailable";

interface WorkspaceView {
  status: ViewStatus;
  members: Member[];
  viewerRole: string | null;
  invites: Invite[];
  invitesStatus: InviteStatus;
}

const IDLE_VIEW: WorkspaceView = {
  status: "idle",
  members: [],
  viewerRole: null,
  invites: [],
  invitesStatus: "hidden",
};

function readMembers(result: Record<string, unknown>): Member[] | null {
  const list = result.members;
  if (!Array.isArray(list)) return null;
  const out: Member[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (row === null) return null;
    const { workspaceId, userId, email, role, joinedAt } = row;
    if (
      typeof workspaceId !== "string" ||
      typeof userId !== "string" ||
      typeof email !== "string" ||
      typeof role !== "string" ||
      typeof joinedAt !== "string"
    ) {
      return null;
    }
    out.push({ workspaceId, userId, email, role, joinedAt });
  }
  return out;
}

function readViewerRole(result: Record<string, unknown>): string | null {
  const role = result.viewerRole;
  return typeof role === "string" ? role : null;
}

function readInvites(result: Record<string, unknown>): Invite[] | null {
  const list = result.invites;
  if (!Array.isArray(list)) return null;
  const out: Invite[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (row === null) return null;
    const { id, email, role, expiresAt, state, createdAt } = row;
    if (
      typeof id !== "string" ||
      typeof email !== "string" ||
      typeof role !== "string" ||
      typeof expiresAt !== "string" ||
      typeof state !== "string" ||
      typeof createdAt !== "string"
    ) {
      return null;
    }
    out.push({ id, email, role, expiresAt, state, createdAt });
  }
  return out;
}

export default function WorkspacesPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [view, setView] = useState<WorkspaceView>(IDLE_VIEW);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [lifetime, setLifetime] = useState("604800");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  // The workspace the page is showing right now. A refresh reads it
  // from here rather than from the closure it was created in, so an
  // action that lands after the operator has switched workspace cannot
  // put the previous workspace's roster back on screen.
  const current = useRef("");

  const load = useCallback(
    async (id: string, signal: AbortSignal): Promise<void> => {
      // The previous workspace's roster and invitations are dropped
      // before the new ones arrive, so a stale table can never sit next
      // to a fresh workspace, or next to a failure.
      setView({ ...IDLE_VIEW, status: "loading" });
      const membersOutcome = await fetchJson(
        `/api/v1/workspaces/${encodeURIComponent(id)}/members`,
        { signal },
        "Load members",
      );
      if (signal.aborted) return;
      if (membersOutcome.status === 401) {
        setView({ ...IDLE_VIEW, status: "signed-out" });
        setNotice("You are signed out.");
        return;
      }
      if (!membersOutcome.ok) {
        setView({
          ...IDLE_VIEW,
          status: membersOutcome.status === 404 ? "denied" : "unavailable",
        });
        return;
      }
      const members = readMembers(membersOutcome.result);
      const viewerRole = readViewerRole(membersOutcome.result);
      if (members === null || viewerRole === null) {
        setView({ ...IDLE_VIEW, status: "unavailable" });
        return;
      }
      const operator = viewerRole === "owner" || viewerRole === "admin";
      // An admin may grant a member only, so the role this person picks
      // starts at the only role they can grant.
      if (viewerRole !== "owner") setRole("member");
      setView({
        status: "ready",
        members,
        viewerRole,
        invites: [],
        invitesStatus: operator ? "loading" : "hidden",
      });
      if (!operator) return;
      const invitesOutcome = await fetchJson(
        `/api/v1/workspaces/${encodeURIComponent(id)}/invites`,
        { signal },
        "Load invitations",
      );
      if (signal.aborted) return;
      if (!invitesOutcome.ok) {
        setView((previous) => ({ ...previous, invitesStatus: "unavailable" }));
        return;
      }
      const invites = readInvites(invitesOutcome.result);
      if (invites === null) {
        setView((previous) => ({ ...previous, invitesStatus: "unavailable" }));
        return;
      }
      setView((previous) => ({
        ...previous,
        invites,
        invitesStatus: "ready",
      }));
    },
    [],
  );

  useEffect(() => {
    request.current?.abort();
    current.current = workspaceId;
    // A link that belonged to the previous workspace is not this
    // workspace's link.
    setInviteLink(null);
    setCopied(false);
    if (workspaceId === "") {
      setView(IDLE_VIEW);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    void load(workspaceId, controller.signal);
    return () => controller.abort();
  }, [workspaceId, load]);

  async function createInvite(): Promise<void> {
    if (busy !== null || workspaceId === "") return;
    setBusy("Create invitation");
    setFailure(null);
    setNotice(null);
    setCopied(false);
    const outcome = await fetchJson(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, ttlSeconds: Number(lifetime) }),
      },
      "Create invitation",
    );
    setBusy(null);
    if (!outcome.ok) {
      setFailure({ code: outcome.code, message: outcome.message });
      return;
    }
    const token = outcome.result.token;
    if (typeof token !== "string" || token.length === 0) {
      setFailure({ code: "UNKNOWN", message: "The invitation was created without a token." });
      return;
    }
    setNotice("Invitation created. Share the link below with the person you invited.");
    setInviteLink(
      typeof window === "undefined" ? token : `${window.location.origin}/invite/${token}`,
    );
    setEmail("");
    void refresh();
  }

  async function revokeInvite(inviteId: string): Promise<void> {
    if (busy !== null || workspaceId === "") return;
    setBusy("Revoke invitation");
    setFailure(null);
    setNotice(null);
    const outcome = await fetchJson(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`,
      { method: "DELETE" },
      "Revoke invitation",
    );
    setBusy(null);
    if (!outcome.ok) {
      setFailure({ code: outcome.code, message: outcome.message });
      return;
    }
    setNotice("Invitation revoked.");
    void refresh();
  }
  async function refresh(): Promise<void> {
    const id = current.current;
    if (id === "") return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    await load(id, controller.signal);
  }

  async function copyInviteLink(): Promise<void> {
    if (inviteLink === null) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setNotice("Invitation link copied.");
    } catch {
      setFailure({
        code: "UNKNOWN",
        message: "The link could not be copied. Copy it from the field instead.",
      });
    }
  }

  const canAct = workspaceId !== "" && busy === null;
  const operator = view.viewerRole === "owner" || view.viewerRole === "admin";

  return (
    <main>
      <h1>Workspaces</h1>
      <p>
        Invite another person to a workspace you belong to, and see who is already
        in it. Skilit sends no email: an invitation is a link you share yourself.
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

      <section aria-label="Workspace">
        <h2>1. Workspace</h2>
        <div>
          <label htmlFor="workspaces-picker">Workspace</label>
          <WorkspaceSelector id="workspaces-picker" value={workspaceId} onChange={setWorkspaceId} />
        </div>
        <div className="sk-account-actions">
          <button
            type="button"
            aria-disabled={busy !== null || workspaceId === ""}
            onClick={() => {
              if (busy !== null || workspaceId === "") return;
              void refresh();
            }}
          >
            Refresh
          </button>
        </div>
      </section>

      {operator ? (
        <section aria-label="Invite someone">
          <h2>2. Invite someone</h2>
          <div>
            <label htmlFor="workspaces-email">Email address</label>
            <input
              id="workspaces-email"
              type="email"
              autoComplete="off"
              className="sk-field-wide"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="workspaces-role">Role</label>
            <select
              id="workspaces-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="member">Member</option>
              {/* An admin may grant a member only, so the option is not
                  offered to one: a control that cannot work is worse
                  than no control. */}
              {view.viewerRole === "owner" ? <option value="admin">Admin</option> : null}
            </select>
          </div>
          <div>
            <label htmlFor="workspaces-lifetime">Valid for</label>
            <select
              id="workspaces-lifetime"
              value={lifetime}
              onChange={(event) => setLifetime(event.target.value)}
            >
              <option value="3600">One hour</option>
              <option value="86400">One day</option>
              <option value="604800">Seven days</option>
              <option value="2592000">Thirty days</option>
            </select>
          </div>
          <button
            type="button"
            aria-disabled={!canAct}
            onClick={() => {
              // The guard names the same condition as the announcement,
              // so a control that is announced unavailable never acts.
              if (!canAct) return;
              void createInvite();
            }}
          >
            Create invitation
          </button>
          {inviteLink !== null ? (
            <div>
              <label htmlFor="workspaces-invite-link">Invitation link</label>
              <input
                id="workspaces-invite-link"
                type="text"
                readOnly
                className="sk-field-wide"
                value={inviteLink}
              />
              <button type="button" onClick={() => void copyInviteLink()}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <p>
                This link is shown once. Anyone who has it can accept the invitation
                until it is revoked or it expires.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {view.status === "ready" && !operator ? (
        <p>
          You are a member of this workspace. Only owners and admins can invite
          people into it.
        </p>
      ) : null}

      <section aria-label="Invitations">
        <h2>3. Invitations</h2>
        {view.status === "idle" ? <p>Select a workspace to see its invitations.</p> : null}
        {view.status === "loading" ? <p>Loading…</p> : null}
        {view.status === "denied" ? (
          <p>You are not a member of this workspace.</p>
        ) : null}
        {view.status === "unavailable" ? (
          <p>The invitations for this workspace could not be loaded.</p>
        ) : null}
        {view.status === "signed-out" ? <p>You are signed out.</p> : null}
        {view.invitesStatus === "hidden" && view.status === "ready" ? (
          <p>Invitations are readable by owners and admins only.</p>
        ) : null}
        {view.invitesStatus === "loading" ? <p>Loading invitations…</p> : null}
        {view.invitesStatus === "unavailable" ? (
          <p>The invitations for this workspace could not be loaded.</p>
        ) : null}
        {view.invitesStatus === "ready" && view.invites.length === 0 ? (
          <p>No invitation has been issued for this workspace.</p>
        ) : null}
        {view.invitesStatus === "ready" && view.invites.length > 0 ? (
          <table className="sk-account-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">State</th>
                <th scope="col">Expires</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {view.invites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td>{invite.role}</td>
                  <td>{invite.state}</td>
                  <td>{new Date(invite.expiresAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      aria-disabled={busy !== null || invite.state !== "pending"}
                      onClick={() => {
                        // The guard names the same condition as the
                        // announcement, so a control that is announced
                        // unavailable never acts.
                        if (busy !== null || invite.state !== "pending") return;
                        void revokeInvite(invite.id);
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section aria-label="Members">
        <h2>4. Members</h2>
        {view.status === "idle" ? <p>Select a workspace to see its roster.</p> : null}
        {view.status === "loading" ? <p>Loading…</p> : null}
        {view.status === "denied" ? <p>You are not a member of this workspace.</p> : null}
        {view.status === "unavailable" ? (
          <p>The roster for this workspace could not be loaded.</p>
        ) : null}
        {view.status === "signed-out" ? <p>You are signed out.</p> : null}
        {view.status === "ready" && view.members.length === 0 ? (
          <p>This workspace has no members.</p>
        ) : null}
        {view.status === "ready" && view.members.length > 0 ? (
          <table className="sk-account-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {view.members.map((member) => (
                <tr key={member.userId}>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>{new Date(member.joinedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <p>
        <a href="/account">Manage your own sessions</a>
      </p>
    </main>
  );
}
