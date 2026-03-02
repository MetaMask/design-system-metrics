#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const METRICS_DIR = path.join(__dirname, '..', 'metrics');
const PROJECTS = ['mobile', 'extension'];

function assertEqual(actual, expected, label) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label} mismatch: expected=${expected}, actual=${actual}`);
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function validatePair(project, date) {
  const base = `${project}-component-metrics-${date}`;
  const dataPath = path.join(METRICS_DIR, `${base}-data.json`);
  const summaryPath = path.join(METRICS_DIR, `${base}-summary.json`);

  const [data, summary] = await Promise.all([readJson(dataPath), readJson(summaryPath)]);

  assertEqual(data.project, project, `${base}.project`);
  assertEqual(data.date, date, `${base}.date`);
  assertEqual(summary.project, project, `${base}-summary.project`);
  assertEqual(summary.date, date, `${base}-summary.date`);

  assertEqual(data.summary.totalComponents, summary.componentsTracked, `${base}.summary.totalComponents`);
  assertEqual(data.summary.mmdsInstances, summary.mmdsInstances, `${base}.summary.mmdsInstances`);
  assertEqual(data.summary.deprecatedInstances, summary.deprecatedInstances, `${base}.summary.deprecatedInstances`);
  assertEqual(data.summary.totalInstances, summary.totalInstances, `${base}.summary.totalInstances`);
  assertEqual(data.summary.migrationPercentage, summary.migrationPercentage, `${base}.summary.migrationPercentage`);
}

async function main() {
  const files = await fs.readdir(METRICS_DIR);
  const errors = [];

  for (const project of PROJECTS) {
    const dates = files
      .filter((file) => file.startsWith(`${project}-component-metrics-`) && file.endsWith('-summary.json'))
      .map((file) => file.match(/(\d{4}-\d{2}-\d{2})/)?.[1])
      .filter(Boolean)
      .sort();

    for (const date of dates) {
      try {
        await validatePair(project, date);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  const [timeline, index] = await Promise.all([
    readJson(path.join(METRICS_DIR, 'timeline.json')),
    readJson(path.join(METRICS_DIR, 'index.json')),
  ]);

  for (const project of PROJECTS) {
    const latestFile = index.latest?.[project];
    if (!latestFile) {
      errors.push(`index.latest.${project} is missing`);
      continue;
    }
    const latestDate = latestFile.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!latestDate) {
      errors.push(`index.latest.${project} has invalid filename: ${latestFile}`);
      continue;
    }

    const latestData = await readJson(path.join(METRICS_DIR, latestFile));
    const lastIdx = timeline[project].dates.length - 1;

    if (lastIdx < 0) {
      errors.push(`timeline.${project}.dates is empty`);
      continue;
    }

    assertEqual(timeline[project].dates[lastIdx], latestDate, `timeline.${project}.latestDate`);
    assertEqual(timeline[project].mmdsInstances[lastIdx], latestData.summary.mmdsInstances, `timeline.${project}.mmdsInstances`);
    assertEqual(timeline[project].deprecatedInstances[lastIdx], latestData.summary.deprecatedInstances, `timeline.${project}.deprecatedInstances`);
    assertEqual(timeline[project].totalInstances[lastIdx], latestData.summary.totalInstances, `timeline.${project}.totalInstances`);
    assertEqual(timeline[project].migrationPercentage[lastIdx], parseFloat(latestData.summary.migrationPercentage), `timeline.${project}.migrationPercentage`);
  }

  if (errors.length > 0) {
    console.error('❌ Metrics consistency validation failed:\n');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log('✅ Metrics consistency validation passed');
}

main().catch((error) => {
  console.error('❌ Validation error:', error.message);
  process.exit(1);
});
