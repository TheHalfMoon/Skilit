"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { sessionRequest } from "../lib/browser-session";
import { researchPreviewPath } from "../lib/research-search-ui";

const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024;

/** Images are fetched only on demand; no external URL or token exposure. */
export function ResearchScreenPreview({ uri, title }: { uri: string; title: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => () => { currentRequest.current?.abort(); }, []);
  useEffect(() => () => {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function toggle(): Promise<void> {
    if (pending) return;
    if (previewUrl !== null) {
      setPreviewUrl(null);
      setMessage(null);
      return;
    }
    const path = researchPreviewPath(uri);
    if (path === null) {
      setMessage("Preview reference is invalid.");
      return;
    }
    const controller = new AbortController();
    currentRequest.current = controller;
    setPending(true);
    setMessage(null);
    try {
      const response = await sessionRequest(path, { signal: controller.signal });
      if (response.status === 404) {
        setMessage("No locally approved image preview is available for this screen.");
        return;
      }
      if (!response.ok) {
        setMessage("The local image preview could not be loaded.");
        return;
      }
      const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!MIME_TYPES.has(mime)) {
        setMessage("The preview returned an unsupported image type.");
        return;
      }
      const blob = await response.blob();
      if (blob.size < 16 || blob.size > MAX_BYTES || blob.type !== mime) {
        setMessage("The preview image has an invalid size or type.");
        return;
      }
      if (!controller.signal.aborted) setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      if (!controller.signal.aborted) setMessage("The local image preview could not be loaded.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (currentRequest.current === controller) currentRequest.current = null;
    }
  }

  return (
    <div className="sk-research-preview">
      <button type="button" disabled={pending} aria-expanded={previewUrl !== null}
        onClick={() => void toggle()}>
        {pending ? "Loading approved image…" : previewUrl === null ? "View approved image" : "Hide image"}
      </button>
      {previewUrl !== null ? (
        <div>
          <Image src={previewUrl} unoptimized width={640} height={400}
            alt={"Research screenshot: " + title}
            style={{ width: "100%", maxWidth: 640, height: "auto", objectFit: "contain" }} />
        </div>
      ) : null}
      {message !== null ? <p role="status">{message}</p> : null}
    </div>
  );
}
