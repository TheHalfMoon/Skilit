/**
 * Secret redaction for build and smoke output.
 *
 * Server output is mirrored into CI logs, so a secret that reaches it is
 * published. A post-hoc assertion can only notice that; the redaction has
 * to happen on the way out. Three properties matter:
 *
 * - every occurrence in a chunk is redacted, not just the first;
 * - a secret split across two chunks is still recognised, so the tail that
 *   could still start a secret is carried over to the next chunk;
 * - a secret that is only known at run time, such as a session token, is
 *   redacted too.
 */

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a redactor for a set of secrets.
 *
 * @param {string[]} secrets literal secret values
 */
export function createRedactor(secrets = []) {
  const literals = [];
  const patterns = [];
  // A session cookie value is not a fixed literal, so the shape is matched.
  patterns.push([/skilit_session=[^\s;"']+/g, "skilit_session=<redacted>"]);

  const add = (secret) => {
    if (typeof secret !== "string" || secret === "") return;
    if (literals.includes(secret)) return;
    literals.push(secret);
    patterns.push([new RegExp(escapeRegExp(secret), "g"), "<redacted>"]);
  };
  for (const secret of secrets) add(secret);

  const carryLength = () => Math.max(0, ...literals.map((secret) => secret.length)) - 1;
  let carry = "";

  return {
    /** Register a secret that is only known at run time. */
    add,
    /** Redact one chunk, holding back a tail that could start a secret. */
    redact(text) {
      const combined = carry + text;
      let output = combined;
      for (const [pattern, replacement] of patterns) {
        output = output.replace(pattern, replacement);
      }
      const length = carryLength();
      // Only the trailing run of characters that could belong to a secret is
      // held back, not the whole tail: holding back more would drop text
      // that was already safe.
      const tail = length > 0 ? output.slice(-length) : "";
      const run = /[A-Za-z0-9_-]+$/.exec(tail);
      carry = run === null ? "" : run[0];
      return output.slice(0, output.length - carry.length);
    },
    /** Emit the held-back tail once the stream has ended. */
    flush() {
      const tail = carry;
      carry = "";
      return tail;
    },
  };
}
