-- 019 workspace invitations: an operator grants another person access to a
-- workspace through a single-use, expiring token bound to exactly one
-- address and one role.
--
-- The token is a bearer secret and is stored only as a hash, exactly like a
-- session token, so a database read cannot be redeemed. The address is
-- normalised (lower case) by the application before it is written, so the
-- uniqueness of a pending invite per workspace and address is a plain
-- lookup rather than a case-insensitive comparison at read time.

create table workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null check(length(trim(email)) > 0 and length(email) <= 320),
  role text not null check(role in ('owner','admin','member')),
  -- The stored secret is a sha-256 hex digest, so it is always 64
  -- characters. A row that holds anything else is not a token this
  -- application can redeem.
  token_hash text not null unique check(length(token_hash) = 64),
  invited_by uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index workspace_invites_workspace_idx on workspace_invites(workspace_id);
create index workspace_invites_email_idx on workspace_invites(email);

-- At most one live invitation per workspace and address. The uniqueness is
-- enforced by the database, not only by the application, so a concurrent
-- pair of issuances cannot both pass an application-level check. An
-- expired invitation is swept to revoked before a new one is issued, and
-- it reads as expired anyway because expiry is checked before
-- revocation.
create unique index workspace_invites_live_idx
  on workspace_invites(workspace_id, email)
  where accepted_at is null and revoked_at is null;
