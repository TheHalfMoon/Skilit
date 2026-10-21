/**
 * The one envelope reader shared by the browser pages.
 *
 * Every page in the interface reads the same canonical agent envelope,
 * so every page used to carry its own copy of the three helpers that
 * decode it. These are the shared copies: they never throw, they never
 * trust a shape they do not recognise, and they never leak a raw
 * exception into the page.
 */

import { sessionRequest } from "./browser-session.ts";

/** A plain object, or null for anything that is not one. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * The failure an envelope carries. A body that is not a failure
 * envelope reads as an unknown failure with the caller's fallback
 * message, never as a raw payload.
 */
function readFailure(
  payload: unknown,
  fallback: string,
): { code: string; message: string } {
  const record = asRecord(payload);
  const error = record === null ? null : asRecord(record.error);
  if (error === null) return { code: "UNKNOWN", message: fallback };
  const code = typeof error.code === "string" ? error.code : "UNKNOWN";
  const message = typeof error.message === "string" ? error.message : fallback;
  return { code, message };
}

/** The result an envelope carries, or null when the shape is unknown. */
function readResult(payload: unknown): Record<string, unknown> | null {
  const record = asRecord(payload);
  return record === null ? null : asRecord(record.result);
}

export type JsonOutcome =
  | { ok: true; status: number; result: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

/**
 * One request, one answer. The caller decides what to do with it; this
 * never throws, so a page cannot forget to handle a failure.
 */
export async function fetchJson(
  path: string,
  init: RequestInit,
  label: string,
): Promise<JsonOutcome> {
  let response: Response;
  try {
    response = await sessionRequest(path, init);
  } catch {
    return { ok: false, status: 0, code: "UNKNOWN", message: `${label} could not reach the server.` };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = readFailure(payload, `${label} failed with HTTP ${response.status}.`);
    return { ok: false, status: response.status, code: failure.code, message: failure.message };
  }
  const result = readResult(payload);
  if (result === null) {
    return {
      ok: false,
      status: response.status,
      code: "UNKNOWN",
      message: `${label} returned an unrecognized shape.`,
    };
  }
  return { ok: true, status: response.status, result };
}
