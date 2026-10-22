import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // PGlite stays out of the bundle via lazy loading in packages/db;
  // pg is pure JavaScript and bundles cleanly.
  serverExternalPackages: ["pg"],
  // Local self-hosted UI handles bearer tokens and workspace-scoped content.
  // This CSP deliberately restricts embedding without constraining Next.js
  // scripts or fetch; tighter script-src policies need separate qualification.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // The invitation token travels in the URL, so the invitation
        // surface never hands it to another origin through the Referer
        // header. A response header takes precedence over the page's
        // own metadata, so the header is the rule that is in force.
        source: "/invite/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
