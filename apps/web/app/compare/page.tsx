"use client";

import { useState, type FormEvent } from "react";
import { SessionAccessBanner } from "../../components/session-access-banner";
import { sessionRequest } from "../../lib/browser-session";
import {
  asComparison,
  comparisonArtifactId,
  comparisonFieldText,
  comparisonPath,
  type Comparison,
} from "../../lib/compare-ui";

type Failure = { code: string; message: string };

function errorOf(payload: unknown, fallback: string): Failure {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (error && typeof error === "object" && "code" in error && "message" in error &&
        typeof error.code === "string" && typeof error.message === "string") {
      return { code: error.code, message: error.message };
    }
  }
  return { code: "UNKNOWN", message: fallback };
}

function SideCard({ title, side }: { title: string; side: Comparison["left"] }) {
  return (
    <section className="sk-compare-side" aria-label={title}>
      <div className="sk-section-kicker">{title}</div>
      <h2>{side.title}</h2>
      <p className="sk-compare-artifact-uri">{side.uri}</p>
      <p>{side.summary ?? "No recorded summary."}</p>
      <dl>
        <div><dt>Kind</dt><dd>{side.kind}</dd></div>
        <div><dt>Rights</dt><dd>{side.rights}</dd></div>
        <div><dt>License</dt><dd>{side.license}</dd></div>
        <div><dt>Trademark</dt><dd>{side.trademark ? "Recorded" : "Not recorded"}</dd></div>
        <div><dt>Serving policy</dt><dd>{side.serving}</dd></div>
      </dl>
      <h3>Recorded tags</h3>
      {side.tags.length === 0 ? <p>No recorded tags.</p> : (
        <ul>{side.tags.map((tag, i) => <li key={`${tag}-${i}`}>{tag}</li>)}</ul>
      )}
    </section>
  );
}

function TermList({ title, terms }: { title: string; terms: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      {terms.length === 0 ? <p>None recorded.</p> : (
        <ul>{terms.map((term, i) => <li key={`${term}-${i}`}>{term}</li>)}</ul>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = comparisonPath(left, right);
    setFailure(null);
    setComparison(null);
    if (path === null) {
      setFailure({ code: "INVALID_INPUT", message: "Enter two valid artifact IDs or skilit://artifact/UUID references." });
      return;
    }
    setPending(true);
    try {
      // The HttpOnly browser cookie is provided by sessionRequest; do not put
      // credentials in the URL, local storage, logs or client-side state.
      const response = await sessionRequest(path);
      const payload: unknown = await response.json();
      if (!response.ok) {
        setFailure(errorOf(payload, `Comparison failed with HTTP ${response.status}.`));
        return;
      }
      const envelope = payload && typeof payload === "object" && "result" in payload
        ? (payload as { result: unknown }).result : null;
      const parsed = asComparison(envelope);
      if (parsed === null ||
          comparisonArtifactId(parsed.left.uri) !== comparisonArtifactId(left) ||
          comparisonArtifactId(parsed.right.uri) !== comparisonArtifactId(right)) {
        setFailure({ code: "INVALID_RESPONSE", message: "The service returned an unrecognized comparison." });
        return;
      }
      setComparison(parsed);
    } catch {
      setFailure({ code: "UNAVAILABLE", message: "Unable to reach the local comparison service." });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="sk-compare-page">
      <h1>Compare design evidence</h1>
      <p>Inspect two readable artifacts side by side using the existing actor-scoped REST and MCP comparison contract. Scores are deterministic lexical overlap, not semantic understanding or visual similarity.</p>
      <SessionAccessBanner />
      <form onSubmit={(event) => void compare(event)} aria-label="Compare two artifacts">
        <label htmlFor="compare-left">First artifact</label>
        <input id="compare-left" value={left} disabled={pending}
          onChange={(event) => { setLeft(event.target.value); setComparison(null); setFailure(null); }}
          placeholder="skilit://artifact/UUID" autoComplete="off" required />
        <label htmlFor="compare-right">Second artifact</label>
        <input id="compare-right" value={right} disabled={pending}
          onChange={(event) => { setRight(event.target.value); setComparison(null); setFailure(null); }}
          placeholder="skilit://artifact/UUID" autoComplete="off" required />
        <button type="submit" disabled={pending}>
          {pending ? "Comparing…" : "Compare evidence"}
        </button>
      </form>
      <div aria-live="polite">
        {pending ? <p>Comparing permitted evidence…</p> : null}
      </div>
      {failure ? <p role="alert">{failure.code}: {failure.message}</p> : null}
      {comparison ? (
        <section className="sk-compare-result" aria-label="Comparison result">
          <h2>Evidence comparison</h2>
          <p>
            {comparison.identical ? "Compared fields are identical." : "Compared fields differ."}
            {" "}Lexical Jaccard overlap: <strong>{comparison.score.toFixed(4)}</strong> (0–1).
          </p>
          <div className="sk-compare-grid">
            <SideCard title="First artifact" side={comparison.left} />
            <SideCard title="Second artifact" side={comparison.right} />
          </div>
          <div className="sk-compare-terms">
            <TermList title="Shared terms" terms={comparison.sharedTerms} />
            <TermList title="First only" terms={comparison.uniqueLeft} />
            <TermList title="Second only" terms={comparison.uniqueRight} />
          </div>
          <h3>Recorded field differences</h3>
          {comparison.fieldDiffs.length === 0 ? <p>No recorded field differences.</p> : (
            <div className="sk-compare-table-wrap">
              <table>
                <caption>Observed differences between the two authorized artifacts</caption>
                <thead><tr><th scope="col">Field</th><th scope="col">First</th><th scope="col">Second</th></tr></thead>
                <tbody>{comparison.fieldDiffs.map((diff, i) => (
                  <tr key={`${diff.field}-${i}`}>
                    <th scope="row">{diff.field}</th>
                    <td>{comparisonFieldText(diff.left)}</td>
                    <td>{comparisonFieldText(diff.right)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
      <p>All values come from recorded, rights-filtered artifact metadata. An unreadable, unknown or denied artifact never renders a comparison, and no source media is copied to the browser.</p>
    </main>
  );
}
