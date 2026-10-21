import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { DbQueryResult, DbTransaction } from "./db.ts";

/**
 * G04-01 authentication baseline: Skilit-owned sign-up/sign-in/sign-out over
 * the 004_auth schema. Shapes stay compatible with a future Better Auth
 * adapter, but this module has no network, no cookies, and no external
 * provider: email/password verification plus opaque session tokens.
 *
 * Security posture: password verifiers are per-user salted scrypt hashes;
 * only SHA-256 hashes of session tokens are stored; sign-in failures return
 * one generic message so unknown emails and wrong passwords are
 * indistinguishable; every failure throws AuthError fail-closed.
 */

export const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_SESSION_MAX_TTL_SECONDS = 90 * 24 * 60 * 60;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const EMAIL_MAX_LENGTH = 320;
const SESSION_TOKEN_BYTES = 32;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
/** Fixed synthetic verifier so unknown-email sign-in costs one scrypt call. */
const DUMMY_VERIFIER =
  `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${"00".repeat(SCRYPT_SALT_BYTES)}$${"00".repeat(SCRYPT_KEYLEN)}`;

export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export interface PublicUser {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface AuthenticatedSession {
  session: SessionInfo;
  user: PublicUser;
}

export interface CreatedSession {
  session: SessionInfo;
  token: string;
}

function toIsoTimestamp(raw: unknown): string {
  return toDate(raw).toISOString();
}

function toDate(raw: unknown): Date {
  const value = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(value.getTime())) throw new Error("Invalid auth timestamp");
  return value;
}

function toPublicUser(row: Record<string, unknown>): PublicUser {
  return {
    id: String(row.id),
    email: String(row.email),
    emailVerifiedAt:
      row.email_verified_at === null ? null : toIsoTimestamp(row.email_verified_at),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

function toSessionInfo(row: Record<string, unknown>): SessionInfo {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    expiresAt: toIsoTimestamp(row.expires_at),
    createdAt: toIsoTimestamp(row.created_at),
  };
}

function requireRow(rows: Record<string, unknown>[]): Record<string, unknown> {
  const row = rows[0];
  if (!row) throw new Error("Database operation returned no row");
  return row;
}

/** Normalize to a canonical email or throw AuthError auth/invalid-email. */
export function normalizeEmail(email: string): string {
  if (typeof email !== "string") {
    throw new AuthError("auth/invalid-email", "Email must be a string.");
  }
  const normalized = email.trim().toLowerCase();
  const at = normalized.indexOf("@");
  const valid =
    normalized.length >= 3 &&
    normalized.length <= EMAIL_MAX_LENGTH &&
    at > 0 &&
    at === normalized.lastIndexOf("@") &&
    at < normalized.length - 1 &&
    !/\s/.test(normalized) &&
    normalized.slice(at + 1).includes(".");
  if (!valid) {
    throw new AuthError("auth/invalid-email", "Email address is invalid.");
  }
  return normalized;
}

function validatePassword(password: string): void {
  if (
    typeof password !== "string" ||
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new AuthError(
      "auth/invalid-password",
      `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
    );
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES).toString("hex");
  const key = scryptSync(password, Buffer.from(salt, "hex"), SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts;
  if (
    n === undefined ||
    r === undefined ||
    p === undefined ||
    salt === undefined ||
    key === undefined
  ) {
    return false;
  }
  let candidate: Buffer;
  try {
    candidate = scryptSync(password, Buffer.from(salt, "hex"), SCRYPT_KEYLEN, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }
  const expected = Buffer.from(key, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isUniqueViolation(error: unknown): boolean {
  return violationCode(error) === "23505" || /unique|duplicate/i.test(errorMessage(error));
}

export function isForeignKeyViolation(error: unknown): boolean {
  return violationCode(error) === "23503";
}

function isInvalidIdentifier(error: unknown): boolean {
  return violationCode(error) === "22P02";
}

function violationCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function signUp(
  tx: DbTransaction,
  input: { email: string; password: string },
): Promise<PublicUser> {
  const email = normalizeEmail(input.email);
  validatePassword(input.password);
  const existing = await tx.query(
    "select id from users where lower(email) = lower($1)",
    [email],
  );
  if (existing.rows.length > 0) {
    throw new AuthError("auth/email-taken", "Email is already registered.");
  }
  try {
    const result = await tx.query(
      `insert into users (email, password_hash)
       values ($1, $2) returning id, email, email_verified_at, created_at, updated_at`,
      [email, hashPassword(input.password)],
    );
    return toPublicUser(requireRow(result.rows));
  } catch (error) {
    // A concurrent sign-up may win the unique index first: converge closed.
    if (isUniqueViolation(error)) {
      throw new AuthError("auth/email-taken", "Email is already registered.");
    }
    throw error;
  }
}

const INVALID_CREDENTIALS = "Invalid email or password.";

export async function signIn(
  tx: DbTransaction,
  input: { email: string; password: string },
): Promise<AuthenticatedSession & { token: string }> {
  const email = normalizeEmail(input.email);
  if (typeof input.password !== "string") {
    throw new AuthError("auth/invalid-credentials", INVALID_CREDENTIALS);
  }
  const result = await tx.query(
    `select id, email, password_hash, email_verified_at, created_at, updated_at
     from users where lower(email) = lower($1)`,
    [email],
  );
  const row = result.rows[0];
  const verifier =
    row === undefined ? DUMMY_VERIFIER : String(row.password_hash);
  const ok = verifyPassword(input.password, verifier);
  if (row === undefined || !ok) {
    throw new AuthError("auth/invalid-credentials", INVALID_CREDENTIALS);
  }
  const created = await createSession(tx, String(row.id));
  return { session: created.session, user: toPublicUser(row), token: created.token };
}

export async function createSession(
  tx: DbTransaction,
  userId: string,
  options?: { ttlSeconds?: number; now?: Date },
): Promise<CreatedSession> {
  // now is a server-supplied clock for deterministic tests; network
  // boundaries must never accept client timestamps here.
  const ttl = options?.ttlSeconds ?? AUTH_SESSION_TTL_SECONDS;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > AUTH_SESSION_MAX_TTL_SECONDS) {
    throw new AuthError("auth/invalid-session", "Session lifetime is invalid.");
  }
  const now = options?.now ?? new Date();
  if (Number.isNaN(now.getTime())) {
    throw new AuthError("auth/invalid-session", "Session lifetime is invalid.");
  }
  const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  try {
    const result = await tx.query(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, $3::timestamptz)
       returning id, user_id, expires_at, created_at`,
      [userId, hashToken(token), expiresAt],
    );
    const created = toSessionInfo(requireRow(result.rows));
    return { session: created, token };
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A 256-bit token collision is not retried silently: fail closed.
      throw new AuthError("auth/invalid-session", "Session could not be created.");
    }
    if (isForeignKeyViolation(error)) {
      throw new AuthError("auth/user-not-found", "User was not found.");
    }
    throw error;
  }
}

/**
 * Validate an opaque session token. The raw token is hashed before lookup
 * and every outcome other than a live unrevoked session fails closed with
 * one generic code, so expired, revoked, and unknown tokens are
 * indistinguishable to callers.
 */
export async function validateSession(
  tx: DbTransaction,
  token: string,
  now?: Date,
): Promise<AuthenticatedSession> {
  if (typeof token !== "string" || token.length === 0) {
    throw new AuthError("auth/invalid-session", "Session is invalid.");
  }
  const at = now ?? new Date();
  const result = await tx.query(
    `select s.id as session_id, s.user_id, s.expires_at as session_expires,
            s.created_at as session_created, s.revoked_at,
            u.id as user_pk, u.email, u.email_verified_at,
            u.created_at as user_created, u.updated_at as user_updated
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new AuthError("auth/invalid-session", "Session is invalid.");
  }
  if (row.revoked_at !== null && row.revoked_at !== undefined) {
    throw new AuthError("auth/invalid-session", "Session is invalid.");
  }
  let expires: Date;
  try {
    expires = toDate(row.session_expires);
  } catch {
    throw new AuthError("auth/invalid-session", "Session is invalid.");
  }
  if (expires.getTime() <= at.getTime()) {
    throw new AuthError("auth/invalid-session", "Session is invalid.");
  }
  return {
    session: {
      id: String(row.session_id),
      userId: String(row.user_id),
      expiresAt: toIsoTimestamp(row.session_expires),
      createdAt: toIsoTimestamp(row.session_created),
    },
    user: toPublicUser({
      ...row,
      id: row.user_pk,
      created_at: row.user_created,
      updated_at: row.user_updated,
    }),
  };
}

/** Revoke a session token. Revoking an already-revoked token succeeds. */
export async function signOut(tx: DbTransaction, token: string): Promise<void> {
  if (typeof token !== "string" || token.length === 0) {
    throw new AuthError("auth/invalid-session", "Session is invalid.");
  }
  const revoked = await tx.query(
    `update sessions set revoked_at = now()
     where token_hash = $1 and revoked_at is null returning id`,
    [hashToken(token)],
  );
  if (revoked.rows.length === 0) {
    const existing = await tx.query(
      "select id from sessions where token_hash = $1",
      [hashToken(token)],
    );
    if (existing.rows.length === 0) {
      throw new AuthError("auth/invalid-session", "Session is invalid.");
    }
  }
}

/**
 * A session as the account holder may see it: never the token, only the
 * session id, when it started, when it expires, and whether it is still
 * usable. The token hash is never exposed.
 */
export interface AccountSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** Live means not revoked and not past its expiry at the supplied clock. */
  live: boolean;
}

function toAccountSession(row: Record<string, unknown>, now: Date): AccountSession {
  const expiresAt = toIsoTimestamp(row.expires_at);
  const revokedAt = row.revoked_at === null || row.revoked_at === undefined
    ? null
    : toIsoTimestamp(row.revoked_at);
  return {
    id: String(row.id),
    createdAt: toIsoTimestamp(row.created_at),
    expiresAt,
    revokedAt,
    live: revokedAt === null && new Date(expiresAt).getTime() > now.getTime(),
  };
}

/**
 * Every session that belongs to one user, newest first. The list is the
 * user's own account surface, so it is derived from the server-side
 * user id and never from a caller-supplied identity.
 */
export async function listAccountSessions(
  tx: DbTransaction,
  userId: string,
  now?: Date,
): Promise<AccountSession[]> {
  const at = now ?? new Date();
  const result = await tx.query(
    `select id, created_at, expires_at, revoked_at
     from sessions where user_id = $1
     order by created_at desc, id desc`,
    [userId],
  );
  return result.rows.map((row) => toAccountSession(row, at));
}

/**
 * Revoke one session that belongs to the given user.
 *
 * Returns false when the session does not exist or belongs to somebody
 * else, so a caller cannot distinguish the two cases: a foreign session
 * id and an invented one are the same absence.
 */
export async function revokeAccountSession(
  tx: DbTransaction,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  if (typeof sessionId !== "string" || sessionId.length === 0) return false;
  try {
    const result = await tx.query(
      `update sessions set revoked_at = now()
       where id = $1 and user_id = $2 and revoked_at is null
       returning id`,
      [sessionId, userId],
    );
    return result.rows.length > 0;
  } catch (error) {
    // A malformed identifier is an absent session, not a database error.
    if (isInvalidIdentifier(error)) return false;
    throw error;
  }
}

/**
 * Revoke every session of one user except the one named, and answer how
 * many were revoked. Used by "sign out of every other session": the
 * caller's own session survives so the browser stays signed in.
 */
export async function revokeOtherAccountSessions(
  tx: DbTransaction,
  userId: string,
  keepSessionId?: string,
): Promise<number> {
  const result = keepSessionId === undefined
    ? await tx.query(
      `update sessions set revoked_at = now()
       where user_id = $1 and revoked_at is null
       returning id`,
      [userId],
    )
    : await tx.query(
      `update sessions set revoked_at = now()
       where user_id = $1 and revoked_at is null and id <> $2
       returning id`,
      [userId, keepSessionId],
    );
  return result.rows.length;
}

export async function getUserById(
  tx: DbTransaction,
  id: string,

): Promise<PublicUser> {
  const row = await selectUserById(tx, id);
  if (row === undefined) {
    throw new AuthError("auth/user-not-found", "User was not found.");
  }
  return toPublicUser(row);
}

async function selectUserById(
  tx: DbTransaction,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const result: DbQueryResult = await tx.query(
      `select id, email, email_verified_at, created_at, updated_at
       from users where id = $1`,
      [id],
    );
    return result.rows[0];
  } catch (error) {
    // Malformed identifiers fail closed as not-found, never as raw SQL errors.
    if (isInvalidIdentifier(error)) {
      throw new AuthError("auth/user-not-found", "User was not found.");
    }
    throw error;
  }
}
