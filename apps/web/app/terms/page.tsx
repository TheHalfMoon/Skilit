import Link from "next/link";

export const metadata = {
  title: "Terms — Skilit",
  description:
    "The governing posture for self-hosted Skilit use: Skilit-owned surfaces, upstream licenses, and owner-provided commercial terms.",
};

export default function Terms() {
  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: "0 24px" }}>
      <h1>Terms</h1>
      <p>
        These notes describe the current self-hosted posture. Formal
        commercial terms, if any, are provided by the repository owner;
        nothing here invents them.
      </p>
      <h2>Skilit-owned surfaces</h2>
      <p>
        The web UI, worker, agent contracts, and adapters in this checkout
        are Skilit-owned. Behavior is defined by the implementation plan,
        architecture, security charter, and governance documents in the
        repository.
      </p>
      <h2>Upstream components</h2>
      <p>
        Donor and provider components are governed by their own upstream
        licenses, pinned in <code>UPSTREAMS.lock.yml</code> with code, data,
        asset, model, and trademark scopes separated. Notices and
        attributions are preserved in the provenance records. A source
        permission never implies asset, dataset, model, or trademark rights.
      </p>
      <p>
        The bundled Inter Tight 600 wordmark font is licensed under the{" "}
        <a href="/brand/Inter-Tight-OFL.txt">SIL Open Font License 1.1</a>.
        That license and its upstream copyright notice are served alongside
        the font.
      </p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Operate within workspace quotas, rate limits, and rights classifications.</li>
        <li>Do not use capture, replay, or adapters against systems you are not authorized to study.</li>
        <li>Report security issues through the channel named on the <Link href="/support">support page</Link>.</li>
      </ul>
      <p>
        See also the <Link href="/privacy">privacy notes</Link>.
      </p>
    </main>
  );
}
