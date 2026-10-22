import type { Metadata } from "next";

/**
 * The invitation token travels in the URL, so this page must never hand
 * it to another origin through the Referer header. The referrer policy
 * is set here, on the invitation surface, rather than across the whole
 * application.
 */
export const metadata: Metadata = {
  referrer: "no-referrer",
};

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
