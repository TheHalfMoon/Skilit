-- 019 rollback: drop the workspace invitation table and its indexes.
-- Invitations carry no durable content beyond an address and a role, and
-- the memberships they created are unaffected by this drop.

drop table if exists workspace_invites;
