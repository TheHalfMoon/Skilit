# Skilit Code Provenance Policy

Status: canonical code-import provenance policy

## Purpose

Skilit intentionally reuses mature permitted source code instead of rebuilding solved infrastructure. Reuse is allowed only when the imported code remains traceable to an immutable source identity and its permission/license obligations are understood.

`UPSTREAMS.lock.yml` is the machine-readable inventory of planned and activated upstream sources. `schemas/upstreams.schema.json` defines its shape, and `scripts/validate_upstreams.py` enforces bootstrap semantic rules.

## Permission and License Are Separate Facts

A user-provided authorization statement is recorded as permission evidence for the scope the user states. It does not automatically determine an upstream license, remove notice obligations, or grant rights to unrelated datasets, assets, model weights, hosted services, brands, or trademarks.

An upstream open-source license is also not evidence that every asset or dataset found in the same repository has identical rights.

For each activated source, Skilit records both:

- `permission_basis`: why Skilit is allowed to use the source;
- `license`: the verified license or governing terms for the imported material.

`VERIFY_AT_IMPORT` is allowed only while a source remains `planned`.

## Immutable Source Identity

No code import may be activated from a moving branch name such as `main`, `master`, `latest`, or another branch ref.

Git sources must bind to a full 40-hex commit SHA before status becomes `ready` or `imported`.

Non-Git release or website artifacts must bind to a SHA-256 digest before activation according to their declared `pin_policy`.

The immutable source identity must be verified again immediately before copying code. Historical planning notes are not sufficient evidence.

## Source Lifecycle

### planned

A planned source records intended capability, role, permission basis, rights questions, and the required pin policy. It must not claim an execution-time pin or verification date.

### ready

A ready source has been re-verified at execution time. It has an immutable pin, a verification date, sufficient rights classification, and a resolved governing basis for the material that will be imported.

For `upstream_license` or `both`, the exact applicable upstream license or terms must be verified. For `user_authorization`, the authorization must be scoped to the source and imported material, while the upstream license state remains recorded truthfully and separately. User authorization does not imply that an upstream open-source license exists and does not extend to unrelated data, assets, models, services, brands, or trademarks.

### imported

An imported source additionally records the paths or material actually imported and the transformations applied by Skilit.

### retired

A retired source remains provenance-bound for historical reproducibility. Retirement does not erase the source identity, license, or import record.

## Import Manifest Before Copy

Before donor code is copied, the grain must define an import manifest that states:

- exact upstream source ID;
- immutable pin;
- paths to include;
- paths to exclude;
- notices/licenses to preserve;
- expected generated/binary files to reject;
- project-owned names that may be changed;
- external/provider identifiers that must remain unchanged;
- planned transformations.

Copy first and document later is not permitted.

## Selective Import

Skilit imports only the capability needed for the active grain. Avoid importing:

- bulk screenshots or media into Git;
- build output;
- generated corpora;
- upstream secrets or environment files;
- deployment credentials;
- provider-specific production configuration not required by Skilit;
- unrelated applications or examples;
- historical Git objects when a selective snapshot is sufficient.

Use donors to delete implementation work, not to import unnecessary complexity.

## Identity and Rebranding

Rename only project-owned identity.

Do not blindly replace:

- package names owned by third parties;
- API/provider identifiers;
- protocol names;
- compatibility aliases;
- license text;
- copyright notices;
- provenance URLs;
- trademarks that must remain as source references.

Every rename/import grain must test for unintended third-party identifier changes.

## Required Evidence for an Import Grain

Before merge, evidence must bind to the exact candidate HEAD and include:

- canonical Skilit base SHA;
- upstream immutable pin;
- source verification date;
- import manifest;
- copied-path inventory;
- content/hash comparison where practical;
- preserved notices/license evidence;
- transformations performed;
- Graft status and blast radius;
- PStack review-panel result (independent fresh-context review, or an explicitly recorded degraded review);
- Alibaba Open Code Review result for reviewable code/configuration;
- tests/CI required by the grain.

## Updating an Upstream

An upstream update is a new governed change, not an in-place mutation of provenance.

The update must:

1. verify a new immutable source pin;
2. compare the old and new upstream state;
3. review license/rights changes;
4. define the bounded imported delta;
5. qualify the resulting Skilit diff normally.

Do not change the stored pin merely to make the lock file match code already copied from an unrecorded revision.

## No Provenance, No Canonical Import

If a material imported code path cannot be traced to a verified source identity and permission/license basis, it is not eligible to become canonical Skilit code.
