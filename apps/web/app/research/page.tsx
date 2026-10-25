"use client";

import { useState, type FormEvent } from "react";
import { SessionAccessBanner } from "../../components/session-access-banner";
import { comparisonArtifactId, comparisonFieldText, type Comparison } from "../../lib/compare-ui";
import { parseResearchComparison, researchComparisonPath, toggleResearchSelection } from "../../lib/research-compare-ui";
import { ResearchScreenPreview } from "../../components/research-screen-preview";
import { sessionRequest } from "../../lib/browser-session";
import {
  parseScreenSearchPage,
  researchSearchPath,
  searchFailure,
  type ResearchScreen,
} from "../../lib/research-search-ui";

/** Search of already-admitted, actor-readable screen metadata, not scraping. */
export default function ResearchPage() {
  const [query, setQuery] = useState("");
  const [loadedQuery, setLoadedQuery] = useState("");
  const [screens, setScreens] = useState<ResearchScreen[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [mode, setMode] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparePending, setComparePending] = useState(false);
  const [compareFailure, setCompareFailure] = useState<string | null>(null);

  async function runSearch(term: string, nextCursor?: string): Promise<void> {
    const path = researchSearchPath(term, nextCursor);
    if (pending || comparePending) return;
    if (nextCursor === undefined) {
      setSelected([]);
      setComparison(null);
      setCompareFailure(null);
      setScreens(null);
      setCursor(null);
      setMode("");
    }
    setFailure(null);
    if (path === null) {
      setFailure("Enter a search phrase of 1–200 characters.");
      return;
    }
    setPending(true);
    try {
      const response = await sessionRequest(path);
      const payload: unknown = await response.json();
      if (!response.ok) {
        setFailure(searchFailure(payload, `Screen search returned HTTP ${response.status}.`));
        return;
      }
      const parsed = parseScreenSearchPage(payload);
      if (parsed === null) {
        setFailure("Screen search returned an unrecognized response.");
        return;
      }
      setScreens((previous) =>
        nextCursor === undefined ? parsed.screens : [...(previous ?? []), ...parsed.screens]);
      setLoadedQuery(term.trim());
      setCursor(parsed.cursor);
      setMode(parsed.searchMode);
    } catch {
      setFailure("Cannot reach the local research search service.");
    } finally {
      setPending(false);
    }
  }

  async function compareSelected(): Promise<void> {
    const path = researchComparisonPath(selected);
    if (path === null || pending || comparePending) return;
    setComparePending(true);
    setCompareFailure(null);
    setComparison(null);
    try {
      // Session cookie is HttpOnly. Identifiers are never persisted in the URL
      // of this page or in local/session storage; the REST handler reauthorizes.
      const response = await sessionRequest(path);
      if (!response.ok) {
        setCompareFailure("The selected screens are not both available for comparison.");
        return;
      }
      const payload: unknown = await response.json();
      const parsed = parseResearchComparison(payload, selected);
      if (parsed === null) {
        setCompareFailure("The research comparison returned an unrecognized response.");
        return;
      }
      setComparison(parsed);
    } catch {
      setCompareFailure("Unable to reach the local comparison service.");
    } finally {
      setComparePending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runSearch(query);
  }

  return (
    <main className="sk-research-page">
      <h1>Research screen search</h1>
      <p>
        Search screen metadata in your permitted design corpus. Results come from the
        local, actor-scoped lexical index — not visual or semantic similarity.
      </p>
      <SessionAccessBanner />
      <form onSubmit={submit} aria-label="Search permitted research screens">
        <label htmlFor="research-query">Screen title, keyword, or description</label>
        <input
          id="research-query" autoComplete="off" value={query} maxLength={200}
          placeholder="For example: onboarding or checkout"
          onChange={(event) => {
            setQuery(event.target.value);
            setScreens(null);
            setCursor(null);
            setSelected([]);
            setComparison(null);
            setCompareFailure(null);
            setFailure(null);
          }}
          disabled={pending || comparePending} required
        />
        <button type="submit" disabled={pending || comparePending}>
          {pending ? "Searching…" : "Search screens"}
        </button>
      </form>
      <div aria-live="polite">
        {pending ? <p>Searching authorized screen metadata…</p> : null}
      </div>
      {failure !== null ? <p role="alert">{failure}</p> : null}
      {screens !== null ? (
        <section className="sk-research-results" aria-label="Research screen results">
          <h2>Results for “{loadedQuery}”</h2>
          <p>
            {screens.length} screen(s) listed using {mode === "postgres-fts" ?
              "PostgreSQL lexical relevance" : "literal text matching"}.
            Results are evidence records, not automatically licensed image downloads.
          </p>
          {screens.length === 0 ? <p>No readable screens matched this query.</p> : (
            <ul className="sk-research-list">
              {screens.map((screen) => (
                <li key={screen.uri}>
                  <h3>{screen.title}</h3>
                  <p className="sk-research-uri">{screen.uri}</p>
                  <dl>
                    <div><dt>Source</dt><dd>{screen.source}</dd></div>
                    <div><dt>Rights</dt><dd>{screen.rights}</dd></div>
                    <div><dt>License claim</dt><dd>{screen.license}</dd></div>
                    <div><dt>Serving</dt><dd>{screen.serving}</dd></div>
                  </dl>
                  <label className="sk-research-select">
                    <input type="checkbox"
                      aria-label={`Select ${screen.title} for comparison`}
                      checked={selected.includes(comparisonArtifactId(screen.uri) ?? "")}
                      disabled={comparePending || (selected.length === 2 &&
                        !selected.includes(comparisonArtifactId(screen.uri) ?? ""))}
                      onChange={() => {
                        setSelected((current) => toggleResearchSelection(current, screen.uri));
                        setComparison(null);
                        setCompareFailure(null);
                      }}
                    />
                    Select for comparison
                  </label>
                  <ResearchScreenPreview uri={screen.uri} title={screen.title} />
                  {screen.serving === "metadata-only" ?
                    <p className="sk-research-disclaimer">Metadata only — image bytes are not available from this result.</p> : null}
                </li>
              ))}
            </ul>
          )}
          {screens.length > 0 ? (
            <div className="sk-research-compare-toolbar" role="group" aria-label="Compare selected screens">
              <p aria-live="polite">{selected.length} of 2 screens selected.</p>
              <button type="button" onClick={() => void compareSelected()}
                disabled={selected.length !== 2 || pending || comparePending}>
                {comparePending ? "Comparing…" : "Compare selected screens"}
              </button>
              <button type="button" disabled={selected.length === 0 || comparePending}
                onClick={() => { setSelected([]); setComparison(null); setCompareFailure(null); }}>
                Clear selection
              </button>
            </div>
          ) : null}
          {compareFailure !== null ? <p role="alert">{compareFailure}</p> : null}
          {comparison !== null ? (
            <section className="sk-research-comparison" aria-label="Research comparison">
              <h3>Selected screen comparison</h3>
              <p>{comparison.identical ? "Recorded fields match." : "Recorded fields differ."}
                {" "}Lexical Jaccard overlap: <strong>{comparison.score.toFixed(4)}</strong> (0–1).
                This compares metadata, not image pixels.</p>
              <div className="sk-research-comparison-grid">
                {[comparison.left, comparison.right].map((side, index) => (
                  <div key={side.uri}>
                    <h4>{index === 0 ? "First" : "Second"}: {side.title}</h4>
                    <p>{side.summary ?? "No recorded summary."}</p>
                    <p>Rights: {side.rights}. License claim: {side.license}.</p>
                    <p>Recorded tags: {side.tags.length ? side.tags.join(", ") : "None"}.</p>
                  </div>
                ))}
              </div>
              <p>Shared terms: {comparison.sharedTerms.length ? comparison.sharedTerms.join(", ") : "None"}.</p>
              {comparison.fieldDiffs.length ? (
                <div className="sk-research-comparison-table-wrap">
                  <table>
                    <caption>Recorded differences between selected screens</caption>
                    <thead><tr><th scope="col">Field</th><th scope="col">First</th><th scope="col">Second</th></tr></thead>
                    <tbody>{comparison.fieldDiffs.map((diff, index) => (
                      <tr key={`${diff.field}-${index}`}>
                        <th scope="row">{diff.field}</th>
                        <td>{comparisonFieldText(diff.left)}</td>
                        <td>{comparisonFieldText(diff.right)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p>No recorded field differences.</p>}
            </section>
          ) : null}
          {cursor !== null ? (
            <button type="button" disabled={pending || comparePending}
              onClick={() => void runSearch(loadedQuery, cursor)}>
              Load more screens
            </button>
          ) : null}
        </section>
      ) : null}
      <p>
        A screen title or license label is not proof of redistribution rights.
        Skilit only searches records admitted through existing source policies.
      </p>
    </main>
  );
}
