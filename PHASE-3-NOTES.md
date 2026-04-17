# Phase 3 Notes

This branch captures the current state of the phase 3 `sync-config` refactor work and the main product/metrics decisions clarified on April 17, 2026.

## Branch

- Working branch: `phase-3`

## Main Finding

Cutting the phase 3 rewrite over to production right now would change the meaning of the current metrics.

The typed rewrite in `pipeline/sync-config.ts` derives deprecated tracked components from source `@deprecated` annotations. The current production system does not work that way yet. It uses the broader hand-maintained `config.json`, which still contains many tracked deprecated entries that do not have source deprecation annotations.

That means a full cutover now would drop a large set of currently tracked entries from the generated config and therefore change downstream metrics behavior.

## Current Metrics Behavior

The current metrics pipeline does not only count components with listed replacements.

There are two separate behaviors in the production scanner:

1. `deprecatedInstances`

Anything listed in `config.json -> projects.<project>.deprecatedComponents` can count as deprecated usage if imports match the configured deprecated paths and the scanner sees it used as a JSX component.

This includes entries that do not have a recorded replacement.

2. Migration progress by MMDS replacement

The migration grouping only uses deprecated entries that have a replacement package under `@metamask/design-system`.

So today:

- deprecated usage counts can include entries without replacements
- migration progress views only include entries with MMDS replacements

This split is one of the reasons the current metrics contract is a bit muddy.

## Clarification on Tracked Deprecated Components

The current system is broader than "only deprecated components with listed replacements".

Right now `config.json` contains:

- tracked deprecated entries with a replacement
- tracked deprecated entries without a replacement

Both can contribute to deprecated usage counts if the scanner matches them in source.

Only the first group cleanly participates in MMDS migration progress reporting.

## Phase 3 Rewrite Status

The phase 3 rewrite exists in parallel at:

- `pipeline/sync-config.ts`
- `config.static.json`

It is intentionally not the production path yet.

Production remains:

- `scripts/sync-config.js`

The package scripts currently expose both paths:

- production: `yarn sync-config`
- rewrite validation: `yarn sync-config:next:check`

## Validation Result

The rewrite validation currently shows a large diff against the existing `config.json`.

At the point this note was written, the rewrite was still removing many currently tracked deprecated mappings because it only picked up source-annotated entries.

That confirms the branch decision to keep the rewrite as a validation path rather than cutting it over in the main pipeline.

## Missing Deprecation Message Follow-up

We also identified that many currently tracked deprecated entries in `config.json` have no `_deprecationMessage`, which means engineers may not see deprecation guidance in source.

GitHub issue:

- `#49` Backfill missing deprecation messages for tracked deprecated components
- https://github.com/MetaMask/design-system-metrics/issues/49

The issue inventory was based on the current `config.json`, not on "components currently counted in metrics".

## Recommended Next Steps

Choose one of these paths before production cutover:

1. Tighten the phase 3 parser until the generated config diff is acceptably small.
2. Explicitly redefine the metrics contract so only source-annotated deprecated components are tracked, then update downstream expectations before cutover.
3. Split the concepts more clearly in data:
   - deprecated tracked usage
   - deprecated tracked usage with MMDS replacement
   - source-annotated deprecated components

## Repo References

- Production sync path: `scripts/sync-config.js`
- Rewrite sync path: `pipeline/sync-config.ts`
- Current tracked config: `config.json`
- Static config for rewrite: `config.static.json`
- Scanner logic: `index.js`
