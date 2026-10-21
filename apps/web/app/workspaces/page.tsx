"use client";

import { SessionAccessBanner } from "../../components/session-access-banner";
import { WorkspaceSelector } from "../../components/workspace-selector";
import { sessionRequest } from "../../lib/browser-session";

import { useCallback, useEffect, useState } from "react";

interface Member {
  workspaceId: string;
  userId: string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readFailure(payload: unknown, fallback: string): { code: string; message: string } {
  const record = asRecord(payload);
  const error = record === null ? null : asRecord(record.error);
  if (error === null) return { code: "UNKNOWN", message: fallback };
  const code = typeof error.code === "string" ? error.code : "UNKNOWN";
  const message = typeof error.message === "string" ? error.message : fallback;
  return { code, message };
}

function readMembers(result: unknown): Member[] | null {
  const record = asRecord(result);
  const list = record === null ? null : record.members;
  if (!Array.isArray(list)) return null;
  const out: Member[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (row === null) return null;
    const { workspaceId, userId, role, joinedAt } = row;
    if (
      typeof workspaceId !== "string" ||
      typeof userId !== "string" ||
      typeof role !== "string" ||
      typeof joinedAt !== "string"
    ) {
      return null;
    }
    out.push({ workspaceId, userId, role, joinedAt });
  }
  return out;
}

function readInvites(result: unknown): Invite[] | null {
  const record = asRecord(result);
  const list = record === null ? null : record.invites;
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
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);

  const callJson = useCallback(
    async (
      label: string,
      path: string,
      init: RequestInit,
      onOk: (result: Record<string, unknown>) => void | Promise<void>,
    ): Promise<void> => {
      setBusy(label);
      setFailure(null);
      try {
        const response = await sessionRequest(path, init);
        if (response.status === 401) {
          setMembers(null);
          setInvites(null);
          setNotice("You are signed out.");
          return;
        }
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          setFailure(readFailure(payload, `${label} failed with HTTP ${response.status}.`));
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
        setFailure({ code: "UNKNOWN", message: `${label} could not reach the server.` });
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const loadMembers = useCallback(
    (id: string) =>
      callJson("Load members", `/api/v1/workspaces/${encodeURIComponent(id)}/members`, {}, (result) => {
        const listed = readMembers(result);
        if (listed === null) {
          setFailure({ code: "UNKNOWN", message: "Listing members returned an unrecognized shape." });
          return;
        }
        setMembers(listed);
      }),
    [callJson],
  );

  const loadInvites = useCallback(
    (id: string) =>
      callJson("Load invitations", `/api/v1/workspaces/${encodeURIComponent(id)}/invites`, {}, (result) => {
        const listed = readInvites(result);
        if (listed === null) {
          setFailure({ code: "UNKNOWN", message: "Listing invitations returned an unrecognized shape." });
          return;
        }
        setInvites(listed);
      }),
    [callJson],
  );

  useEffect(() => {
    if (workspaceId === "") {
      setMembers(null);
      setInvites(null);
      return;
    }
    void loadMembers(workspaceId);
    void loadInvites(workspaceId);
  }, [workspaceId, loadMembers, loadInvites]);

  function createInvite(): void {
    if (busy !== null || workspaceId === "") return;
    setNotice(null);
    setInviteLink(null);
    void callJson(
      "Create invitation",
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      },
      (result) => {
        const token = result.token;
        if (typeof token !== "string" || token.length === 0) {
          setFailure({ code: "UNKNOWN", message: "The invitation was created without a token." });
          return;
        }
        setNotice("Invitation created. Share the link below with the person you invited.");
        setInviteLink(
          typeof window === "undefined" ? token : `${window.location.origin}/invite/${token}`,
        );
        setEmail("");
        void loadInvites(workspaceId);
      },
    );
  }

  function revokeInvite(inviteId: string): void {
    if (busy !== null || workspaceId === "") return;
    setNotice(null);
    void callJson(
      "Revoke invitation",
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invites/${encodeURIComponent(inviteId)}`,
      { method: "DELETE" },
      () => {
        setNotice("Invitation revoked.");
        void loadInvites(workspaceId);
      },
    );
  }

  const canAct = workspaceId !== "" && busy === null;

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
      </section>

      <section aria-label="Invite someone">
        <h2>2. Invite someone</h2>
        <div>
          <label htmlFor="workspaces-email">Email address</label>
          <input
            id="workspaces-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={{ width: "100%" }}
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
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="button" disabled={!canAct} onClick={() => createInvite()}>
          Create invitation
        </button>
        {inviteLink !== null ? (
          <div>
            <label htmlFor="workspaces-invite-link">Invitation link</label>
            <input
              id="workspaces-invite-link"
              type="text"
              readOnly
              value={inviteLink}
              style={{ width: "100%" }}
            />
            <p>
              This link is shown once. Anyone who has it can accept the invitation
              until it is revoked or it expires.
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="Invitations">
        <h2>3. Invitations</h2>
        {invites === null ? <p>No workspace is selected.</p> : null}
        {invites !== null && invites.length === 0 ? (
          <p>No invitation has been issued for this workspace.</p>
        ) : null}
        {invites !== null && invites.length > 0 ? (
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
              {invites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td>{invite.role}</td>
                  <td>{invite.state}</td>
                  <td>{new Date(invite.expiresAt).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      disabled={busy !== null || invite.state !== "pending"}
                      onClick={() => revokeInvite(invite.id)}
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
        {members === null ? <p>No workspace is selected.</p> : null}
        {members !== null && members.length === 0 ? (
          <p>This workspace has no members.</p>
        ) : null}
        {members !== null && members.length > 0 ? (
          <table className="sk-account-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>
                    <code>{member.userId}</code>
                  </td>
                  <td>{member.role}</td>
                  <td>{new Date(member.joinedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}
