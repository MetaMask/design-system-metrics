#!/usr/bin/env node

/**
 * Builds untracked-timeline.json from all dated {extension,mobile}-untracked-YYYY-MM-DD.json files.
 *
 * Reads:  metrics/*-untracked-YYYY-MM-DD.json
 * Writes: metrics/untracked-timeline.json
 *         dashboard/public/metrics/untracked-timeline.json (when that dir exists)
 *
 * Run: yarn update-untracked-timeline
 *      (also invoked by yarn pipeline)
 */

const fs = require('fs');
const path = require('path');
const { computeAdoptionPercentage } = require('./lib/adoption-metrics');

const ROOT = path.join(__dirname, '..');
const METRICS_DIR = path.join(ROOT, 'metrics');
const DASHBOARD_METRICS_DIR = path.join(ROOT, 'dashboard', 'public', 'metrics');
const OUTPUT_FILE = path.join(METRICS_DIR, 'untracked-timeline.json');

/** Filter a replaceableWithMMDS array to strict local-oneoff only. */
function localOneoffReplaceable(items) {
  if (!items || items.length === 0) return [];
  // If sourceCategory is absent (old format), include everything as a rough proxy
  const hasCat = items.some(r => r.sourceCategory);
  if (!hasCat) return items;
  return items.filter(r => r.sourceCategory === 'local-oneoff');
}

/** Filter a futureDSCandidates array to traceable local-oneoffs (isDSCandidate). */
function localOneoffCandidates(items) {
  if (!items || items.length === 0) return [];
  const hasCat = items.some(r => r.sourceCategory);
  if (!hasCat) return items;
  return items.filter(r =>
    r.sourceCategory === 'local-oneoff' &&
    r.canonicalSource &&
    !r.canonicalSource.startsWith('('),
  );
}

function extractEntry(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const d = JSON.parse(raw);

  const replaceable = localOneoffReplaceable(d.replaceableWithMMDS || []);
  const candidates = localOneoffCandidates(d.futureDSCandidates || []);

  const replaceableInstances = replaceable.reduce((s, r) => s + (r.instances || 0), 0);
  const candidateInstances = candidates.reduce((s, r) => s + (r.instances || 0), 0);

  const trackedMMDS = d.summary?.trackedMMDS ?? 0;
  const trackedDeprecated = d.summary?.trackedDeprecated ?? 0;
  const trueAdoption = computeAdoptionPercentage(trackedMMDS, trackedDeprecated, replaceableInstances);

  return {
    date: d.date,
    replaceableCount: replaceable.length,
    replaceableInstances,
    candidateCount: candidates.length,
    candidateInstances,
    trackedMMDS,
    trackedDeprecated,
    trueAdoption,
  };
}

function buildProjectTimeline(project) {
  const DATE_RE = new RegExp(`^${project}-untracked-(\\d{4}-\\d{2}-\\d{2})\\.json$`);

  const files = fs.readdirSync(METRICS_DIR)
    .filter(f => DATE_RE.test(f))
    .sort();

  // Deduplicate by date — keep last file alphabetically (latest data for that date)
  const byDate = new Map();
  for (const f of files) {
    const m = f.match(DATE_RE);
    if (m) byDate.set(m[1], f);
  }

  const entries = [];
  for (const [, file] of [...byDate.entries()].sort()) {
    try {
      const entry = extractEntry(path.join(METRICS_DIR, file));
      entries.push(entry);
    } catch (err) {
      console.warn(`  Skipping ${file}: ${err.message}`);
    }
  }

  return {
    dates: entries.map(e => e.date),
    replaceableCount: entries.map(e => e.replaceableCount),
    replaceableInstances: entries.map(e => e.replaceableInstances),
    candidateCount: entries.map(e => e.candidateCount),
    candidateInstances: entries.map(e => e.candidateInstances),
    trackedMMDS: entries.map(e => e.trackedMMDS),
    trackedDeprecated: entries.map(e => e.trackedDeprecated),
    trueAdoption: entries.map(e => e.trueAdoption),
  };
}

console.log('Building untracked timeline…');

if (!fs.existsSync(METRICS_DIR)) {
  console.error(`Metrics directory not found: ${METRICS_DIR}`);
  process.exit(1);
}

const timeline = {
  generatedAt: new Date().toISOString(),
  extension: buildProjectTimeline('extension'),
  mobile: buildProjectTimeline('mobile'),
};

fs.mkdirSync(METRICS_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(timeline, null, 2));
console.log(`✓ Wrote ${OUTPUT_FILE}`);

if (fs.existsSync(DASHBOARD_METRICS_DIR)) {
  const dashboardOut = path.join(DASHBOARD_METRICS_DIR, 'untracked-timeline.json');
  fs.writeFileSync(dashboardOut, JSON.stringify(timeline, null, 2));
  console.log(`✓ Wrote ${dashboardOut}`);
}

console.log(`  Extension: ${timeline.extension.dates.length} data points`);
console.log(`  Mobile:    ${timeline.mobile.dates.length} data points`);
