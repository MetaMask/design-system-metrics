#!/usr/bin/env node

/**
 * Backfill historical component lists for previous summary files
 *
 * This script:
 * 1. Checks out the design system repo at different dates
 * 2. Scans the component folders to get the list at that time
 * 3. Updates summary files with mmdsComponentsList
 * 4. Calculates newComponents by comparing with previous week
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

const METRICS_DIR = path.join(__dirname, '..', 'metrics');
const MMDS_REPO = path.join(__dirname, '..', 'repos', 'metamask-design-system');

const excludeList = [
  'BadgeCountSize',
  'BadgeStatusStatus',
  'BadgeWrapperPosition',
  'ButtonBaseSize',
  'IconName',
  'TextVariant'
];

/**
 * Get components from index.ts at a specific git ref
 */
async function getComponentsAtRef(ref, packagePath) {
  try {
    // Get the index.ts file content at this ref
    const indexPath = `${packagePath}/src/components/index.ts`;
    const content = execSync(
      `cd "${MMDS_REPO}" && git show ${ref}:${indexPath}`,
      { encoding: 'utf8' }
    );

    const components = new Set();
    const exportRegex = /export\s+\{\s*([^}]+)\s*\}\s+from\s+['"]\.\/([^'"]+)['"]/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const exports = match[1];
      const importPath = match[2];
      const baseName = importPath.split('/').pop();

      const exportedNames = exports
        .split(',')
        .map(name => name.trim())
        .filter(name => name && !name.includes('type'));

      const componentName = exportedNames.find(name => name === baseName);
      if (componentName && !excludeList.includes(componentName)) {
        components.add(componentName);
      }
    }

    return Array.from(components).sort();
  } catch (err) {
    console.error(`  ⚠️  Could not get components at ${ref}: ${err.message}`);
    return [];
  }
}

/**
 * Find the closest commit to a date
 */
function findCommitAtDate(date) {
  try {
    const commit = execSync(
      `cd "${MMDS_REPO}" && git rev-list -1 --before="${date}" main`,
      { encoding: 'utf8' }
    ).trim();
    return commit;
  } catch (err) {
    console.error(`  ⚠️  Could not find commit for ${date}: ${err.message}`);
    return null;
  }
}

/**
 * Compare two component lists and find new ones
 */
function findNewComponents(currentList, previousList) {
  if (!previousList || previousList.length === 0) {
    return [];
  }
  const previousSet = new Set(previousList);
  return currentList.filter(comp => !previousSet.has(comp));
}

/**
 * Update summary file with component list data
 */
async function updateSummaryFile(summaryPath, componentsList, newComponents) {
  try {
    const content = await fs.readFile(summaryPath, 'utf8');
    const summary = JSON.parse(content);

    summary.mmdsComponentsList = componentsList;
    summary.newComponents = newComponents;

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`  ✓ Updated ${path.basename(summaryPath)}`);

    return true;
  } catch (err) {
    console.error(`  ⚠️  Failed to update ${summaryPath}: ${err.message}`);
    return false;
  }
}

/**
 * Process a specific date
 */
async function processDate(date, project, packagePath) {
  console.log(`\n📅 Processing ${project} for ${date}...`);

  const commit = findCommitAtDate(date);
  if (!commit) {
    return null;
  }

  console.log(`  Commit: ${commit.substring(0, 8)}`);

  const components = await getComponentsAtRef(commit, packagePath);
  console.log(`  Found ${components.length} components`);

  return components;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Backfilling historical component lists...\n');

  // Dates to process (last 3 weeks)
  const dates = [
    '2026-02-14',
    '2026-02-21',
    '2026-02-27'
  ];

  // Mobile (React Native)
  console.log('\n📱 Processing Mobile (React Native)...');
  let previousMobileComponents = null;

  for (const date of dates) {
    const components = await processDate(
      date,
      'mobile',
      'packages/design-system-react-native'
    );

    if (components) {
      const newComponents = findNewComponents(components, previousMobileComponents);
      const summaryFile = path.join(METRICS_DIR, `mobile-component-metrics-${date}-summary.json`);

      if (await fs.access(summaryFile).then(() => true).catch(() => false)) {
        await updateSummaryFile(summaryFile, components, newComponents);
        if (newComponents.length > 0) {
          console.log(`    🎉 New components: ${newComponents.join(', ')}`);
        }
      }

      previousMobileComponents = components;
    }
  }

  // Extension (React)
  console.log('\n💻 Processing Extension (React)...');
  let previousExtensionComponents = null;

  for (const date of dates) {
    const components = await processDate(
      date,
      'extension',
      'packages/design-system-react'
    );

    if (components) {
      const newComponents = findNewComponents(components, previousExtensionComponents);
      const summaryFile = path.join(METRICS_DIR, `extension-component-metrics-${date}-summary.json`);

      if (await fs.access(summaryFile).then(() => true).catch(() => false)) {
        await updateSummaryFile(summaryFile, components, newComponents);
        if (newComponents.length > 0) {
          console.log(`    🎉 New components: ${newComponents.join(', ')}`);
        }
      }

      previousExtensionComponents = components;
    }
  }

  console.log('\n✅ Backfill complete! Now run:');
  console.log('   yarn extract-json');
  console.log('   yarn update-timeline');
  console.log('   cd dashboard && npm run dev\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
