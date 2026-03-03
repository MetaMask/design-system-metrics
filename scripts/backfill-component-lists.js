#!/usr/bin/env node

/**
 * Backfill historical MMDS component availability across all metric dates.
 *
 * For each project/date summary file, this script:
 * 1) Resolves the design-system commit at/before that date.
 * 2) Extracts exported component names from package index.ts.
 * 3) Updates summary + data JSON with:
 *    - mmdsComponentsAvailable
 *    - mmdsComponentsList
 *    - newComponents
 *
 * Usage:
 *   node scripts/backfill-component-lists.js
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { parseComponentsFromIndexContent } = require('./lib/component-export-parser');

const ROOT = path.join(__dirname, '..');
const METRICS_DIR = path.join(ROOT, 'metrics');
const MMDS_REPO = path.join(ROOT, 'repos', 'metamask-design-system');

const PROJECTS = {
  mobile: 'packages/design-system-react-native',
  extension: 'packages/design-system-react',
};

function getDateFromFilename(filename) {
  return filename.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

function findCommitAtDate(date) {
  try {
    const commit = execSync(
      `cd "${MMDS_REPO}" && git rev-list -1 --before="${date} 23:59:59" main`,
      { encoding: 'utf8' },
    ).trim();
    return commit || null;
  } catch (err) {
    return null;
  }
}

function getComponentsAtRef(ref, packagePath) {
  try {
    const indexPath = `${packagePath}/src/components/index.ts`;
    const content = execSync(
      `cd "${MMDS_REPO}" && git show ${ref}:${indexPath}`,
      { encoding: 'utf8' },
    );
    return parseComponentsFromIndexContent(content);
  } catch (err) {
    return [];
  }
}

function findNewComponents(current, previous) {
  if (!previous || previous.length === 0) {
    return [];
  }
  const prev = new Set(previous);
  return current.filter((name) => !prev.has(name));
}

async function updateJsonFile(filePath, updater) {
  const raw = await fs.readFile(filePath, 'utf8');
  const json = JSON.parse(raw);
  updater(json);
  await fs.writeFile(filePath, JSON.stringify(json, null, 2));
}

async function processProject(project, packagePath) {
  const files = await fs.readdir(METRICS_DIR);
  const summaryFiles = files
    .filter(
      (file) =>
        file.startsWith(`${project}-component-metrics-`) && file.endsWith('-summary.json'),
    )
    .sort();

  if (summaryFiles.length === 0) {
    console.log(`⚠️  No summary files found for ${project}`);
    return;
  }

  console.log(`\n📦 ${project}: processing ${summaryFiles.length} weekly summaries`);

  let previousComponents = null;

  for (const summaryFile of summaryFiles) {
    const date = getDateFromFilename(summaryFile);
    if (!date) {
      console.log(`  ⚠️  Skipping ${summaryFile} (missing date)`);
      continue;
    }

    const commit = findCommitAtDate(date);
    if (!commit) {
      console.log(`  ⚠️  ${date}: no design-system commit found`);
      continue;
    }

    const components = getComponentsAtRef(commit, packagePath);
    if (components.length === 0) {
      console.log(`  ⚠️  ${date}: component list empty at ${commit.substring(0, 8)}`);
      continue;
    }

    const newComponents = findNewComponents(components, previousComponents);
    const summaryPath = path.join(METRICS_DIR, summaryFile);
    const dataPath = path.join(
      METRICS_DIR,
      summaryFile.replace('-summary.json', '-data.json'),
    );

    await updateJsonFile(summaryPath, (summary) => {
      summary.mmdsComponentsAvailable = components.length;
      summary.mmdsComponentsList = components;
      summary.newComponents = newComponents;
    });

    try {
      await updateJsonFile(dataPath, (data) => {
        data.mmdsComponentsAvailable = components.length;
        data.mmdsComponentsList = components;
        data.newComponents = newComponents;
      });
    } catch (err) {
      // Keep going if older data file is missing.
    }

    console.log(
      `  ✓ ${date}: ${components.length} components (${newComponents.length} new)`,
    );
    previousComponents = components;
  }
}

async function main() {
  console.log('🔄 Backfilling historical MMDS component availability');

  for (const [project, packagePath] of Object.entries(PROJECTS)) {
    await processProject(project, packagePath);
  }

  console.log('\n✅ Backfill complete. Next steps:');
  console.log('   yarn update-timeline');
  console.log('   yarn validate-metrics');
  console.log('   cp metrics/*.json dashboard/public/metrics/');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
