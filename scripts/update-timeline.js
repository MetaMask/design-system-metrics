#!/usr/bin/env node

/**
 * Update Timeline and Index Data
 *
 * Aggregates all historical JSON data files into:
 * 1. timeline.json - Time series data for charts
 * 2. index.json - Manifest of all available data files
 *
 * This script should be run after xlsx-to-json.js to ensure
 * all JSON data files are up to date.
 *
 * Usage:
 *   node scripts/update-timeline.js
 */

const fs = require('fs').promises;
const path = require('path');

const METRICS_DIR = path.join(__dirname, '..', 'metrics');
const MIGRATION_TARGETS_PATH = path.join(__dirname, '..', 'migration-targets.json');

/**
 * Load all data JSON files from metrics directory
 */
async function loadAllDataFiles() {
  const files = await fs.readdir(METRICS_DIR);
  const dataFiles = files
    .filter(f => f.endsWith('-data.json') && f.includes('component-metrics'))
    .sort();

  console.log(`📂 Found ${dataFiles.length} data file(s)\n`);

  const allData = {
    mobile: [],
    extension: []
  };

  for (const file of dataFiles) {
    try {
      const filePath = path.join(METRICS_DIR, file);
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      if (data.project === 'mobile' || data.project === 'extension') {
        allData[data.project].push({
          date: data.date,
          file,
          data
        });
        console.log(`  ✓ Loaded ${file}`);
      }
    } catch (error) {
      console.error(`  ⚠️  Error loading ${file}:`, error.message);
    }
  }

  // Sort by date
  allData.mobile.sort((a, b) => a.date.localeCompare(b.date));
  allData.extension.sort((a, b) => a.date.localeCompare(b.date));

  console.log(`\n📊 Loaded ${allData.mobile.length} mobile file(s)`);
  console.log(`📊 Loaded ${allData.extension.length} extension file(s)\n`);

  return allData;
}

/**
 * Build timeline data for a project
 */
function buildProjectTimeline(projectData) {
  if (projectData.length === 0) {
    return {
      dates: [],
      migrationPercentage: [],
      mmdsInstances: [],
      deprecatedInstances: [],
      totalInstances: [],
      componentsFullyMigrated: [],
      componentsInProgress: [],
      componentsNotStarted: [],
      totalComponents: [],
      mmdsComponentsAvailable: [],
      mmdsComponentsList: [],
      newComponents: []
    };
  }

  const timeline = {
    dates: [],
    migrationPercentage: [],
    mmdsInstances: [],
    deprecatedInstances: [],
    totalInstances: [],
    componentsFullyMigrated: [],
    componentsInProgress: [],
    componentsNotStarted: [],
    totalComponents: [],
    mmdsComponentsAvailable: [],
    mmdsComponentsList: [],
    newComponents: []
  };

  for (const entry of projectData) {
    const { date, data } = entry;
    const { summary } = data;

    timeline.dates.push(date);
    timeline.migrationPercentage.push(parseFloat(summary.migrationPercentage));
    timeline.mmdsInstances.push(summary.mmdsInstances);
    timeline.deprecatedInstances.push(summary.deprecatedInstances);
    timeline.totalInstances.push(summary.totalInstances);
    timeline.componentsFullyMigrated.push(summary.fullyMigrated);
    timeline.componentsInProgress.push(summary.inProgress);
    timeline.componentsNotStarted.push(summary.notStarted);
    timeline.totalComponents.push(summary.totalComponents);
    timeline.mmdsComponentsAvailable.push(data.mmdsComponentsAvailable || 0);
    timeline.mmdsComponentsList.push(data.mmdsComponentsList || []);
    timeline.newComponents.push(data.newComponents || []);
  }

  return timeline;
}

/**
 * Calculate week-over-week changes
 */
function calculateChanges(timeline) {
  if (timeline.dates.length < 2) {
    return null;
  }

  const latest = timeline.dates.length - 1;
  const previous = latest - 1;

  return {
    migrationPercentageChange: (timeline.migrationPercentage[latest] - timeline.migrationPercentage[previous]).toFixed(2),
    mmdsInstancesChange: timeline.mmdsInstances[latest] - timeline.mmdsInstances[previous],
    deprecatedInstancesChange: timeline.deprecatedInstances[latest] - timeline.deprecatedInstances[previous],
    componentsFullyMigratedChange: timeline.componentsFullyMigrated[latest] - timeline.componentsFullyMigrated[previous],
    componentsInProgressChange: timeline.componentsInProgress[latest] - timeline.componentsInProgress[previous],
    mmdsComponentsAvailableChange: timeline.mmdsComponentsAvailable[latest] - timeline.mmdsComponentsAvailable[previous]
  };
}

/**
 * Build complete timeline JSON
 */
async function buildTimeline(allData) {
  console.log('📈 Building timeline data...\n');

  const timeline = {
    generatedAt: new Date().toISOString(),
    mobile: buildProjectTimeline(allData.mobile),
    extension: buildProjectTimeline(allData.extension)
  };

  // Add week-over-week changes for latest data
  timeline.mobile.latestChange = calculateChanges(timeline.mobile);
  timeline.extension.latestChange = calculateChanges(timeline.extension);

  // Add summary stats
  timeline.summary = {
    totalWeeks: Math.max(timeline.mobile.dates.length, timeline.extension.dates.length),
    dateRange: {
      start: timeline.mobile.dates[0] || timeline.extension.dates[0] || null,
      end: timeline.mobile.dates[timeline.mobile.dates.length - 1] ||
           timeline.extension.dates[timeline.extension.dates.length - 1] || null
    }
  };

  const timelinePath = path.join(METRICS_DIR, 'timeline.json');
  await fs.writeFile(timelinePath, JSON.stringify(timeline, null, 2));
  console.log('  ✓ Generated timeline.json');
  console.log(`    • ${timeline.mobile.dates.length} mobile data points`);
  console.log(`    • ${timeline.extension.dates.length} extension data points`);
  console.log(`    • Date range: ${timeline.summary.dateRange.start} to ${timeline.summary.dateRange.end}\n`);

  return timeline;
}

/**
 * Build index JSON
 */
async function buildIndex(allData) {
  console.log('📑 Building index manifest...\n');

  const index = {
    lastUpdated: new Date().toISOString(),
    projects: {
      mobile: allData.mobile.map(entry => ({
        date: entry.date,
        file: entry.file
      })),
      extension: allData.extension.map(entry => ({
        date: entry.date,
        file: entry.file
      }))
    },
    latest: {
      mobile: allData.mobile.length > 0
        ? allData.mobile[allData.mobile.length - 1].file
        : null,
      extension: allData.extension.length > 0
        ? allData.extension[allData.extension.length - 1].file
        : null
    }
  };

  const indexPath = path.join(METRICS_DIR, 'index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  console.log('  ✓ Generated index.json');
  console.log(`    • ${index.projects.mobile.length} mobile entries`);
  console.log(`    • ${index.projects.extension.length} extension entries`);
  console.log(`    • Latest mobile: ${index.latest.mobile || 'N/A'}`);
  console.log(`    • Latest extension: ${index.latest.extension || 'N/A'}\n`);

  return index;
}

/**
 * Publish migration targets alongside metrics outputs for dashboard/runtime consumers.
 */
async function publishMigrationTargets() {
  try {
    const content = await fs.readFile(MIGRATION_TARGETS_PATH, 'utf8');
    const source = JSON.parse(content);

    const output = {
      generatedAt: new Date().toISOString(),
      mobile: {
        source: source.mobile?.source || null,
        components: source.mobile?.components || [],
      },
      extension: {
        source: source.extension?.source || null,
        components: source.extension?.components || [],
      },
    };

    const outputPath = path.join(METRICS_DIR, 'migration-targets.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log('  ✓ Generated migration-targets.json\n');
  } catch (error) {
    console.warn(`  ⚠️  Skipped migration-targets.json: ${error.message}\n`);
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Updating timeline and index data\n');

    const allData = await loadAllDataFiles();
    const timeline = await buildTimeline(allData);
    const index = await buildIndex(allData);
    await publishMigrationTargets();

    console.log('✅ Successfully updated timeline and index!\n');

    // Print summary
    if (timeline.mobile.latestChange) {
      console.log('📊 Latest Changes (Mobile):');
      console.log(`  • Migration: ${timeline.mobile.latestChange.migrationPercentageChange > 0 ? '+' : ''}${timeline.mobile.latestChange.migrationPercentageChange}%`);
      console.log(`  • MMDS instances: ${timeline.mobile.latestChange.mmdsInstancesChange > 0 ? '+' : ''}${timeline.mobile.latestChange.mmdsInstancesChange}`);
      console.log(`  • Deprecated instances: ${timeline.mobile.latestChange.deprecatedInstancesChange > 0 ? '+' : ''}${timeline.mobile.latestChange.deprecatedInstancesChange}`);
      console.log(`  • Fully migrated: ${timeline.mobile.latestChange.componentsFullyMigratedChange > 0 ? '+' : ''}${timeline.mobile.latestChange.componentsFullyMigratedChange} components\n`);
    }

    if (timeline.extension.latestChange) {
      console.log('📊 Latest Changes (Extension):');
      console.log(`  • Migration: ${timeline.extension.latestChange.migrationPercentageChange > 0 ? '+' : ''}${timeline.extension.latestChange.migrationPercentageChange}%`);
      console.log(`  • MMDS instances: ${timeline.extension.latestChange.mmdsInstancesChange > 0 ? '+' : ''}${timeline.extension.latestChange.mmdsInstancesChange}`);
      console.log(`  • Deprecated instances: ${timeline.extension.latestChange.deprecatedInstancesChange > 0 ? '+' : ''}${timeline.extension.latestChange.deprecatedInstancesChange}`);
      console.log(`  • Fully migrated: ${timeline.extension.latestChange.componentsFullyMigratedChange > 0 ? '+' : ''}${timeline.extension.latestChange.componentsFullyMigratedChange} components\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
