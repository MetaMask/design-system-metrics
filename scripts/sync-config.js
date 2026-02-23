#!/usr/bin/env node

/**
 * Sync config.json with latest component data from repos
 *
 * Orchestrates the full workflow:
 * 1. Update git submodules
 * 2. Scan for deprecated components in Extension and Mobile
 * 3. Fetch MMDS component lists
 * 4. Map deprecated → MMDS replacements
 * 5. Merge with existing config.json
 * 6. Write updated config
 * 7. Print summary report
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const { scanForDeprecated } = require('./lib/scanner');
const { fetchMMDSComponents } = require('./lib/mmds-fetcher');
const { mapComponent } = require('./lib/component-mapper');
const { mergeConfig, writeConfig, generateReport } = require('./lib/config-merger');

const REPO_ROOT = path.join(__dirname, '..');
const REPOS_DIR = path.join(REPO_ROOT, 'repos');
const CONFIG_PATH = path.join(REPO_ROOT, 'config.json');

// Repo paths
const EXTENSION_REPO = path.join(REPOS_DIR, 'metamask-extension');
const MOBILE_REPO = path.join(REPOS_DIR, 'metamask-mobile');
const MMDS_REPO = path.join(REPOS_DIR, 'metamask-design-system');

/**
 * Update git submodules to latest
 */
async function updateSubmodules() {
  console.log('📦 Updating git submodules...\n');

  try {
    execSync('git submodule update --remote --merge', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    console.log('✅ Submodules updated\n');
  } catch (err) {
    console.error('❌ Failed to update submodules:', err.message);
    throw err;
  }
}

/**
 * Main sync workflow
 */
async function sync(options = {}) {
  const { dryRun = false, skipUpdate = false } = options;

  console.log('🚀 Starting config.json sync...\n');

  // Step 1: Update submodules (unless --skip-update)
  if (!skipUpdate) {
    await updateSubmodules();
  } else {
    console.log('⏭️  Skipping submodule update\n');
  }

  // Step 2: Scan for deprecated components
  console.log('🔍 Scanning for deprecated components...\n');

  const [extensionDeprecated, mobileDeprecated] = await Promise.all([
    scanForDeprecated(EXTENSION_REPO, 'extension'),
    scanForDeprecated(MOBILE_REPO, 'mobile'),
  ]);

  console.log(`  Found ${extensionDeprecated.length} deprecated components in Extension`);
  console.log(`  Found ${mobileDeprecated.length} deprecated components in Mobile\n`);

  // Step 3: Fetch MMDS component lists
  console.log('📚 Fetching MMDS component lists...\n');

  const mmdsComponents = await fetchMMDSComponents(MMDS_REPO);

  console.log(`  React: ${mmdsComponents.react.length} components`);
  console.log(`  React Native: ${mmdsComponents.reactNative.length} components\n`);

  // Step 4: Map deprecated → MMDS
  console.log('🗺️  Mapping deprecated components to MMDS replacements...\n');

  const extensionMapped = {};
  const mobileMapped = {};

  for (const component of extensionDeprecated) {
    const replacement = mapComponent(component, mmdsComponents);
    extensionMapped[component.name] = {
      paths: [component.relativePath],
      replacement: replacement,
      _deprecationMessage: component.deprecationMessage,
    };
  }

  for (const component of mobileDeprecated) {
    const replacement = mapComponent(component, mmdsComponents);
    mobileMapped[component.name] = {
      paths: [component.relativePath],
      replacement: replacement,
      _deprecationMessage: component.deprecationMessage,
    };
  }

  // Count replacements
  const extensionWithReplacement = Object.values(extensionMapped).filter(c => c.replacement !== null).length;
  const mobileWithReplacement = Object.values(mobileMapped).filter(c => c.replacement !== null).length;

  console.log(`  Extension: ${extensionWithReplacement}/${extensionDeprecated.length} mapped to MMDS`);
  console.log(`  Mobile: ${mobileWithReplacement}/${mobileDeprecated.length} mapped to MMDS\n`);

  // Step 5: Load existing config for report comparison
  let existingConfig = {};
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf8');
    existingConfig = JSON.parse(content);
  } catch (err) {
    console.log('ℹ️  No existing config found, will create new one\n');
  }

  // Step 6: Merge with existing config
  console.log('🔀 Merging with existing config.json...\n');

  const discoveredData = {
    extension: {
      deprecatedComponents: extensionMapped,
      currentComponents: mmdsComponents.react,
      currentPackages: ['@metamask/design-system-react'],
    },
    mobile: {
      deprecatedComponents: mobileMapped,
      currentComponents: mmdsComponents.reactNative,
      currentPackages: ['@metamask/design-system-react-native'],
    },
  };

  const mergedConfig = await mergeConfig(CONFIG_PATH, discoveredData, mmdsComponents);

  // Step 7: Generate report
  const report = generateReport(existingConfig, mergedConfig);

  console.log('📊 Summary of changes:\n');
  console.log(`  Added: ${report.added.length}`);
  console.log(`  Updated: ${report.updated.length}`);
  console.log(`  Removed: ${report.removed.length}`);
  console.log(`  Preserved (manual): ${report.preserved.length}\n`);

  if (report.added.length > 0) {
    console.log('  New components:');
    report.added.forEach(({ project, component }) => {
      console.log(`    - [${project}] ${component}`);
    });
    console.log();
  }

  if (report.updated.length > 0) {
    console.log('  Updated replacements:');
    report.updated.forEach(({ project, component, old, new: newReplacement }) => {
      const oldStr = old ? `${old.component} (${old.package})` : 'null';
      const newStr = newReplacement ? `${newReplacement.component} (${newReplacement.package})` : 'null';
      console.log(`    - [${project}] ${component}: ${oldStr} → ${newStr}`);
    });
    console.log();
  }

  if (report.removed.length > 0) {
    console.log('  Removed components:');
    report.removed.forEach(({ project, component }) => {
      console.log(`    - [${project}] ${component}`);
    });
    console.log();
  }

  // Step 8: Write config (unless --dry-run)
  if (dryRun) {
    console.log('🔍 DRY RUN - No changes written to config.json\n');
  } else {
    await writeConfig(CONFIG_PATH, mergedConfig);
    console.log('✅ Config written to config.json\n');
  }

  console.log('🎉 Sync complete!\n');
}

// CLI argument parsing
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  skipUpdate: args.includes('--skip-update'),
};

// Run sync
sync(options).catch(err => {
  console.error('❌ Sync failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
