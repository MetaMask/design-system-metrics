#!/usr/bin/env node

/**
 * Discover MMDS platform alignment (Figma unknown, React vs React Native, Code Connect).
 *
 * Reads:  repos/metamask-design-system package component folders
 *         config/alignment-exceptions.json
 * Writes: metrics/alignment-YYYY-MM-DD.json
 *         metrics/alignment-latest.json
 *         metrics/alignment-timeline.json
 *
 * Run: yarn discover-alignment [--date YYYY-MM-DD]
 */

const fs = require('fs');
const path = require('path');
const { buildAlignmentReport, scanMmdsPackages } = require('./lib/alignment-inventory');

const ROOT = path.join(__dirname, '..');
const METRICS_DIR = path.join(ROOT, 'metrics');
const DASHBOARD_METRICS_DIR = path.join(ROOT, 'dashboard', 'public', 'metrics');
const DS_ROOT = path.join(ROOT, 'repos/metamask-design-system');
const EXCEPTIONS_PATH = path.join(ROOT, 'config/alignment-exceptions.json');

/** Minimum days between timeline points — one weekly reporting point per window. */
const MIN_WEEKLY_TIMELINE_GAP_DAYS = 7;

function daysBetweenDates(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

function parseArgs(argv) {
  const opts = {
    date: process.env.METRICS_DATE || new Date().toISOString().split('T')[0],
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date') opts.date = argv[++i];
  }
  return opts;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function buildTimeline() {
  const DATE_RE = /^alignment-(\d{4}-\d{2}-\d{2})\.json$/;
  const byDate = new Map();
  if (!fs.existsSync(METRICS_DIR)) return { generatedAt: new Date().toISOString(), dates: [] };

  for (const file of fs.readdirSync(METRICS_DIR).filter((f) => DATE_RE.test(f)).sort()) {
    const date = file.match(DATE_RE)[1];
    byDate.set(date, file);
  }

  const dates = [];
  const requiredCoverage = [];
  const openGaps = [];
  const missingOnReact = [];
  const missingOnReactNative = [];
  const codeConnectCoverage = [];
  const codeConnectGaps = [];
  const missingCodeConnectReact = [];
  const missingCodeConnectReactNative = [];
  const requiredSharedCount = [];
  const inventoryCount = [];
  let latestSnapshot = null;

  for (const [date, file] of [...byDate.entries()].sort()) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(METRICS_DIR, file), 'utf8'));
      latestSnapshot = { date, data };

      if (dates.length > 0) {
        const daysSinceLast = daysBetweenDates(dates[dates.length - 1], date);
        if (daysSinceLast < MIN_WEEKLY_TIMELINE_GAP_DAYS) {
          console.warn(
            `  Skipping ${date} in timeline (${daysSinceLast} day(s) after ${dates[dates.length - 1]}; weekly cadence is ${MIN_WEEKLY_TIMELINE_GAP_DAYS}+ days)`,
          );
          continue;
        }
      }

      dates.push(date);
      requiredCoverage.push(data.summary?.requiredCoverage ?? null);
      openGaps.push(data.summary?.openGaps ?? null);
      missingOnReact.push(data.summary?.missingOnReact ?? null);
      missingOnReactNative.push(data.summary?.missingOnReactNative ?? null);
      codeConnectCoverage.push(data.summary?.codeConnectCoverage ?? null);
      codeConnectGaps.push(data.summary?.codeConnectGaps ?? null);
      missingCodeConnectReact.push(data.summary?.missingCodeConnectReact ?? null);
      missingCodeConnectReactNative.push(data.summary?.missingCodeConnectReactNative ?? null);
      requiredSharedCount.push(data.summary?.requiredSharedCount ?? null);
      inventoryCount.push(data.summary?.inventoryCount ?? null);
    } catch (err) {
      console.warn(`  Skipping ${file}: ${err.message}`);
    }
  }

  const latestData = latestSnapshot?.data;
  return {
    generatedAt: new Date().toISOString(),
    dates,
    requiredCoverage,
    openGaps,
    missingOnReact,
    missingOnReactNative,
    codeConnectCoverage,
    codeConnectGaps,
    missingCodeConnectReact,
    missingCodeConnectReactNative,
    requiredSharedCount,
    inventoryCount,
    latest:
      latestSnapshot && latestData
        ? {
            date: latestSnapshot.date,
            requiredCoverage: latestData.summary?.requiredCoverage ?? null,
            openGaps: latestData.summary?.openGaps ?? null,
            missingOnReact: latestData.summary?.missingOnReact ?? null,
            missingOnReactNative: latestData.summary?.missingOnReactNative ?? null,
            codeConnectCoverage: latestData.summary?.codeConnectCoverage ?? null,
            codeConnectGaps: latestData.summary?.codeConnectGaps ?? null,
            missingCodeConnectReact: latestData.summary?.missingCodeConnectReact ?? null,
            missingCodeConnectReactNative: latestData.summary?.missingCodeConnectReactNative ?? null,
          }
        : null,
  };
}

function main() {
  const opts = parseArgs(process.argv);

  if (!fs.existsSync(DS_ROOT)) {
    console.error(`Design system repo not found: ${DS_ROOT}`);
    process.exit(1);
  }

  const exceptions = JSON.parse(fs.readFileSync(EXCEPTIONS_PATH, 'utf8'));
  const scan = scanMmdsPackages(DS_ROOT);
  const report = buildAlignmentReport({
    ...scan,
    exceptions,
    date: opts.date,
    generatedAt: new Date().toISOString(),
  });

  const datedFile = path.join(METRICS_DIR, `alignment-${opts.date}.json`);
  const latestFile = path.join(METRICS_DIR, 'alignment-latest.json');
  writeJson(datedFile, report);
  writeJson(latestFile, report);
  console.log(`✓ Wrote ${datedFile}`);
  console.log(`✓ Wrote ${latestFile}`);

  const timeline = buildTimeline();
  const timelineFile = path.join(METRICS_DIR, 'alignment-timeline.json');
  writeJson(timelineFile, timeline);
  console.log(`✓ Wrote ${timelineFile}`);

  if (fs.existsSync(DASHBOARD_METRICS_DIR)) {
    for (const name of [`alignment-${opts.date}.json`, 'alignment-latest.json', 'alignment-timeline.json']) {
      writeJson(path.join(DASHBOARD_METRICS_DIR, name), JSON.parse(fs.readFileSync(path.join(METRICS_DIR, name), 'utf8')));
    }
    console.log(`✓ Copied alignment artifacts to dashboard/public/metrics/`);
  }

  const s = report.summary;
  console.log(
    `  inventory ${s.inventoryCount}, required ${s.requiredSharedCount}, coverage ${s.requiredCoverage}%, open gaps ${s.openGaps} (React ${s.missingOnReact}, RN ${s.missingOnReactNative}), Code Connect gaps ${s.codeConnectGaps} (React ${s.missingCodeConnectReact}, RN ${s.missingCodeConnectReactNative}), Figma linked ${s.figmaLinked}, Code Connect ${s.codeConnectCoverage}%`,
  );
}

main();
