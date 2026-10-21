"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { sessionRequest } from "../lib/browser-session";
import { SkilitIcon } from "./skilit-icon";

type SessionState =
  | { status: "checking" }
  | { status: "authenticated"; email: string }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export function SessionAccessBanner() {
  const [session, setSession] = useState<SessionState>({ status: "checking" });

  useEffect(() => {
    const onExpired = () => setSession({ status: "unauthenticated" });
    window.addEventListener("skilit:session-expired", onExpired);
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await sessionRequest("/api/v1/auth/session", { signal: controller.signal });
        if (!response.ok) {
          setSession({ status: response.status === 401 ? "unauthenticated" : "unavailable" });
          return;
        }
        const payload: unknown = await response.json();
        const result = payload && typeof payload === "object" && "result" in payload
          ? (payload as { result?: unknown }).result
          : null;
        const user = result && typeof result === "object" && "user" in result
          ? (result as { user?: unknown }).user
          : null;
        const email = user && typeof user === "object" && "email" in user
          ? (user as { email?: unknown }).email
          : null;
        setSession(typeof email === "string" && email !== ""
          ? { status: "authenticated", email }
          : { status: "unavailable" });
      } catch {
        if (!controller.signal.aborted) setSession({ status: "unavailable" });
      }
    })();
    return () => {
      controller.abort();
      window.removeEventListener("skilit:session-expired", onExpired);
    };
  }, []);

  return (
    <aside className="sk-session-banner" aria-label="Workspace session" aria-live="polite">
      <SkilitIcon name="shield" size={19} />
      <span className="sk-session-banner-message">
        {session.status === "checking" && "Checking your browser session…"}
        {session.status === "authenticated" && <>Signed in as <strong>{session.email}</strong>. Your secure session is used automatically.</>}
        {session.status === "unauthenticated" && "Sign in to access workspace data. No bearer token needs to be pasted."}
        {session.status === "unavailable" && "Unable to verify your session right now. Check your local service."}
      </span>
      <Link
        href={session.status === "authenticated" ? "/account" : "/login"}
        className="sk-session-banner-link"
      >
        {session.status === "authenticated" ? "Account" : "Sign in"}
        <SkilitIcon name="arrow-up-right" size={16} />
      </Link>
    </aside>
  );
}
