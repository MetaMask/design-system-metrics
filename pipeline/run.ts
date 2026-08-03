/**
 * Pipeline Orchestrator
 *
 * Runs all pipeline stages in the correct order.
 * Fails fast on any stage error.
 *
 * Usage:
 *   yarn pipeline                          # full run
 *   yarn pipeline --date 2026-03-14        # backfill a specific date
 *   yarn pipeline --only sync-config,scan  # run specific stages (debugging)
 */

import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const METRICS_DIR = path.join(ROOT, 'metrics');
const DASHBOARD_METRICS_DIR = path.join(ROOT, 'dashboard', 'public', 'metrics');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const date = getFlag('--date');
const onlyFlag = getFlag('--only');
const onlyStages = onlyFlag ? new Set(onlyFlag.split(',').map((s) => s.trim())) : null;

// ---------------------------------------------------------------------------
// Stage runner
// ---------------------------------------------------------------------------

interface Stage {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

function run(stage: Stage): void {
  const label = `[${stage.name}]`;
  const start = Date.now();

  if (onlyStages && !onlyStages.has(stage.name)) {
    console.log(`${label} skipped`);
    return;
  }

  console.log(`\n${label} starting…`);

  const result = spawnSync(stage.command, stage.args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...stage.env,
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (result.status !== 0) {
    console.error(`\n${label} failed after ${elapsed}s (exit ${result.status ?? 'unknown'})`);
    process.exit(result.status ?? 1);
  }

  console.log(`${label} done in ${elapsed}s`);
}

// ---------------------------------------------------------------------------
// Copy metrics to dashboard
// ---------------------------------------------------------------------------

async function copyMetricsToDashboard(): Promise<void> {
  await fs.mkdir(DASHBOARD_METRICS_DIR, { recursive: true });

  const files = await fs.readdir(METRICS_DIR);
  const jsonFiles = files.filter((f: string) => f.endsWith('.json'));

  await Promise.all(
    jsonFiles.map((f: string) =>
      fs.copyFile(path.join(METRICS_DIR, f), path.join(DASHBOARD_METRICS_DIR, f)),
    ),
  );

  console.log(`  ✓ Copied ${jsonFiles.length} file(s) to dashboard/public/metrics/`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const totalStart = Date.now();
  const dateEnv: Record<string, string> = date ? { METRICS_DATE: date } : {};

  if (date) console.log(`\nPipeline running for date: ${date}`);
  if (onlyStages) console.log(`Running only stages: ${[...onlyStages].join(', ')}`);

  console.log('\n━━━ Pipeline starting ━━━');

  // 1. Sync config from @deprecated tags in repos
  run({
    name: 'sync-config',
    command: 'node',
    args: ['scripts/sync-config.js'],
  });

  // 2. Scan extension
  run({
    name: 'scan:extension',
    command: 'node',
    args: ['index.js', '--project', 'extension'],
    env: dateEnv,
  });

  // 3. Scan mobile
  run({
    name: 'scan:mobile',
    command: 'node',
    args: ['index.js', '--project', 'mobile'],
    env: dateEnv,
  });

  // 4. Discover untracked components
  run({
    name: 'discover:extension',
    command: 'node',
    args: ['scripts/discover-untracked.js', '--project', 'extension'],
    env: dateEnv,
  });

  run({
    name: 'discover:mobile',
    command: 'node',
    args: ['scripts/discover-untracked.js', '--project', 'mobile'],
    env: dateEnv,
  });

  // 5. Rebuild one-off / untracked historical trend from dated discover outputs
  run({
    name: 'update-untracked-timeline',
    command: 'node',
    args: ['scripts/update-untracked-timeline.js'],
  });

  // 6. Props audit
  run({
    name: 'props-audit',
    command: 'node',
    args: ['scripts/component-props-audit.js'],
    env: {
      ...dateEnv,
      NODE_OPTIONS: '',
    },
  });

  // 7. Update migration timeline + index
  run({
    name: 'update-timeline',
    command: 'tsx',
    args: ['pipeline/update-timeline.ts'],
  });

  // 8. Validate consistency
  run({
    name: 'validate',
    command: 'tsx',
    args: ['pipeline/validate.ts'],
  });

  // 9. Copy to dashboard
  if (!onlyStages || onlyStages.has('copy')) {
    console.log('\n[copy] starting…');
    const copyStart = Date.now();
    await copyMetricsToDashboard();
    console.log(`[copy] done in ${((Date.now() - copyStart) / 1000).toFixed(1)}s`);
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n━━━ Pipeline complete in ${totalElapsed}s ━━━\n`);
}

main().catch((err) => {
  console.error(`\n❌ Pipeline error: ${(err as Error).message}`);
  process.exit(1);
});
