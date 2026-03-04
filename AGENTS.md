# AGENTS

Use this as the quick-start guide when making changes in this repository.

## Start Here

1. Read `README.md` sections:
   - `Primary Product Features`
   - `Project Architecture`
   - `Maintainer Workflow`
2. Check `package.json` scripts and `.github/workflows/*.yml` before changing automation.

## Task Routing

- Metrics scanner/report logic: `index.js`
- Config sync/discovery logic: `scripts/sync-config.js`, `scripts/lib/*`
- Timeline/index derivation: `scripts/update-timeline.js`
- Data consistency checks: `scripts/validate-metrics-consistency.js`
- Slack output: `scripts/generate-slack-report.js`
- Dashboard UI/data hooks: `dashboard/src/*`
- Generated artifacts: `metrics/*`

## Standard Local Workflow

```bash
yarn install
yarn setup-repos

yarn sync-config
yarn start
yarn start:mobile
yarn update-timeline
yarn validate-metrics
yarn slack-report --output metrics/slack-report-YYYY-MM-DD.md
cp metrics/*.json dashboard/public/metrics/
cd dashboard && npm ci && npm run build
```

If generating for a historical date, set `METRICS_DATE=YYYY-MM-DD` when running `yarn start` / `yarn start:mobile`.

## Validation Expectations

For any change touching generation or schemas:

1. Regenerate affected metric outputs.
2. Run `yarn update-timeline`.
3. Run `yarn validate-metrics`.
4. If dashboard data contracts changed, run `cd dashboard && npm run build`.

## Guardrails

- Keep JSON schemas backward-compatible unless you also update dashboard types and readers.
- Do not hand-edit generated files in `metrics/` unless explicitly doing a repair/backfill task.
- Prefer updating `config.json` via `yarn sync-config`; reserve manual edits for intentional overrides.
- Weekly automation truth is in `.github/workflows/weekly-metrics.yml`.

## Documentation Policy

- Current source of truth docs:
  - `README.md` (user-facing)
  - `AGENTS.md` (agent execution guide)
