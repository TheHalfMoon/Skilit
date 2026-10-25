"use client";

import { useState, type FormEvent } from "react";
import { SessionAccessBanner } from "../../components/session-access-banner";
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

  async function runSearch(term: string, nextCursor?: string): Promise<void> {
    const path = researchSearchPath(term, nextCursor);
    if (pending) return;
    if (nextCursor === undefined) {
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
            setFailure(null);
          }}
          disabled={pending} required
        />
        <button type="submit" disabled={pending}>
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
                  <ResearchScreenPreview uri={screen.uri} title={screen.title} />
                  {screen.serving === "metadata-only" ?
                    <p className="sk-research-disclaimer">Metadata only — image bytes are not available from this result.</p> : null}
                </li>
              ))}
            </ul>
          )}
          {cursor !== null ? (
            <button type="button" disabled={pending} onClick={() => void runSearch(loadedQuery, cursor)}>
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
