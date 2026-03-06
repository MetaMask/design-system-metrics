#!/usr/bin/env node

/**
 * Generate Slack Markdown Report for Weekly Design System Updates
 *
 * Generates a formatted markdown report for Slack based on:
 * - config.json (component counts and mappings)
 * - migration-targets.json (curated migration lists)
 * - Latest metrics from metrics/ folder
 *
 * Usage:
 *   node scripts/generate-slack-report.js
 *   node scripts/generate-slack-report.js --output report.md
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const MIGRATION_TARGETS_PATH = path.join(__dirname, '..', 'migration-targets.json');
const METRICS_DIR = path.join(__dirname, '..', 'metrics');

// GitHub URLs
const MMDS_REACT_COMPONENTS = 'https://github.com/MetaMask/metamask-design-system/tree/main/packages/design-system-react/src/components';
const MMDS_RN_COMPONENTS = 'https://github.com/MetaMask/metamask-design-system/tree/main/packages/design-system-react-native/src/components';
const GITHUB_REPO = 'https://github.com/georgewrmarshall/design-system-metrics/blob/main';

/**
 * Get latest data filename from index.json
 */
function getLatestDataFile(project) {
  const indexPath = path.join(METRICS_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  return index?.latest?.[project] || null;
}

/**
 * Get the latest metrics workbook for a project based on latest date in index.json
 */
function getLatestMetricsFile(project) {
  const latestDataFile = getLatestDataFile(project);
  if (!latestDataFile) return null;
  return latestDataFile.replace('-data.json', '.xlsx');
}

/**
 * Get the latest metrics summary for a project
 */
function getLatestMetricsSummary(project) {
  try {
    const latestDataFile = getLatestDataFile(project);
    if (latestDataFile) {
      const summaryPath = path.join(METRICS_DIR, latestDataFile.replace('-data.json', '-summary.json'));
      const content = fs.readFileSync(summaryPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading summary for ${project}:`, err.message);
  }
  return null;
}

/**
 * Count MMDS components available in the design system package
 * Now reads directly from the summary files which use anti-fragile name-matching
 */
function countAvailableMMDSComponents(project) {
  const summary = getLatestMetricsSummary(project);
  return summary?.mmdsComponentsAvailable || 0;
}

function normalizeTargetEntries(projectTargets) {
  const raw = projectTargets?.components || [];

  return raw
    .map((entry) => {
      if (typeof entry === 'string') {
        return { name: entry, status: 'to_do' };
      }

      return {
        name: entry?.name,
        status: entry?.status || 'to_do',
      };
    })
    .filter((entry) => typeof entry.name === 'string' && entry.name.length > 0);
}

/**
 * Compare static migration targets against current MMDS export list.
 * Matching is case-insensitive to avoid casing drift between sources.
 * `not_doing` targets are excluded from completion/remaining totals.
 */
function getTargetCoverage(project, migrationTargets, summary) {
  const targets = normalizeTargetEntries(migrationTargets?.[project]);
  const exportedComponents = summary?.mmdsComponentsList || [];
  const exportedByLower = new Set(
    exportedComponents.map((component) => component.toLowerCase()),
  );

  const completedTargets = [];
  const remainingTargets = [];
  const notDoingTargets = [];

  for (const target of targets) {
    if (target.status === 'not_doing') {
      notDoingTargets.push(target.name);
      continue;
    }

    const isExported = exportedByLower.has(target.name.toLowerCase());
    if (target.status === 'complete' || isExported) {
      completedTargets.push(target.name);
    } else {
      remainingTargets.push(target.name);
    }
  }

  return {
    totalTargets: completedTargets.length + remainingTargets.length,
    completedTargets,
    remainingTargets,
    notDoingTargets,
  };
}

/**
 * Get list of new components since last report
 * For now, returns placeholder - can be enhanced to compare with previous reports
 */
function getNewComponents(project) {
  // This could be enhanced to compare with previous config.json or a baseline
  // For now, returning empty array as placeholder
  return [];
}

/**
 * Parse latest metrics to extract usage counts
 * This is a simplified version - the full implementation would parse the Excel file
 */
function getUsageStats(project, config) {
  const deprecatedComponents = config.projects[project].deprecatedComponents;

  // Count total deprecated component instances (placeholder - would need Excel parsing)
  const deprecatedPaths = Object.values(deprecatedComponents)
    .filter(comp => !comp.replacement || !comp.replacement.package?.includes('@metamask/design-system'))
    .flatMap(comp => comp.paths || []);

  // Count MMDS-mapped component instances (placeholder - would need Excel parsing)
  const mmdsPaths = Object.values(deprecatedComponents)
    .filter(comp => comp.replacement?.package?.includes('@metamask/design-system'))
    .flatMap(comp => comp.paths || []);

  return {
    mmdsInstances: 0, // Would be populated from Excel
    totalInstances: 0, // Would be populated from Excel
    percentage: 0 // Would be calculated from Excel data
  };
}

/**
 * Generate the markdown report
 */
function generateReport(config, migrationTargets) {
  const report = [];

  report.push('### Design System Weekly Update\n');
  report.push('* **MetaMask Design System (MMDS)**');

  // Mobile section
  const mobileConfig = config.projects.mobile;
  const mobileMMDSCount = countAvailableMMDSComponents('mobile');
  const mobileMetricsFile = getLatestMetricsFile('mobile');
  const mobileSummary = getLatestMetricsSummary('mobile');
  const mobileNewComponents = getNewComponents('mobile');

  report.push('  * **Mobile**');
  report.push(`    * MMDS components available: ${mobileMMDSCount} [components](${MMDS_RN_COMPONENTS})`);
  if (mobileSummary && mobileSummary.newComponents && mobileSummary.newComponents.length > 0) {
    report.push(`      * New components: ${mobileSummary.newComponents.join(', ')}`);
  }
  if (mobileSummary) {
    report.push(`    * MMDS usage: ${mobileSummary.mmdsInstances} instances in codebase`);
    report.push(`    * Deprecated components: ${mobileSummary.componentsTracked} legacy component types`);
  }

  // Extension section
  const extensionConfig = config.projects.extension;
  const extensionMMDSCount = countAvailableMMDSComponents('extension');
  const extensionMetricsFile = getLatestMetricsFile('extension');
  const extensionSummary = getLatestMetricsSummary('extension');
  const extensionNewComponents = getNewComponents('extension');

  report.push('  * **Extension**');
  report.push(`    * MMDS components available: ${extensionMMDSCount} [components](${MMDS_REACT_COMPONENTS})`);
  if (extensionSummary && extensionSummary.newComponents && extensionSummary.newComponents.length > 0) {
    report.push(`      * New components: ${extensionSummary.newComponents.join(', ')}`);
  }
  if (extensionSummary) {
    report.push(`    * MMDS usage: ${extensionSummary.mmdsInstances} instances in codebase`);
    report.push(`    * Deprecated components: ${extensionSummary.componentsTracked} legacy component types`);
  }

  // Migration Progress section
  report.push('* **Migration Progress**');

  // Mobile migration
  report.push('  * **Mobile**');
  const mobileCoverage = getTargetCoverage('mobile', migrationTargets, mobileSummary);
  const mobileRemainingTargets = mobileCoverage.remainingTargets.length;
  const mobileMigratedNumerator = mobileMMDSCount;
  const mobileMigratedDenominator = mobileCoverage.totalTargets;
  report.push(`    * Target components: ${mobileCoverage.totalTargets} planned (${mobileCoverage.completedTargets.length} completed, ${mobileRemainingTargets} remaining) (${migrationTargets.mobile?.source || 'N/A'})`);
  report.push(`    * Migrated to MMDS: ${mobileMigratedNumerator}/${mobileMigratedDenominator} (${mobileMigratedDenominator > 0 ? Math.round((mobileMigratedNumerator / mobileMigratedDenominator) * 100) : 0}%)`);
  if (mobileSummary && mobileMetricsFile) {
    report.push(`    * Instance replacement: ${mobileSummary.migrationPercentage}% ([breakdown](${GITHUB_REPO}/metrics/${mobileMetricsFile}))`);
  }

  // Extension migration
  report.push('  * **Extension**');
  const extensionCoverage = getTargetCoverage('extension', migrationTargets, extensionSummary);
  const extensionRemainingTargets = extensionCoverage.remainingTargets.length;
  const extensionMigratedNumerator = extensionMMDSCount;
  const extensionMigratedDenominator = extensionCoverage.totalTargets;
  report.push(`    * Target components: ${extensionCoverage.totalTargets} planned (${extensionCoverage.completedTargets.length} completed, ${extensionRemainingTargets} remaining) (${migrationTargets.extension?.source || 'N/A'})`);
  report.push(`    * Migrated to MMDS: ${extensionMigratedNumerator}/${extensionMigratedDenominator} (${extensionMigratedDenominator > 0 ? Math.round((extensionMigratedNumerator / extensionMigratedDenominator) * 100) : 0}%)`);
  if (extensionSummary && extensionMetricsFile) {
    report.push(`    * Instance replacement: ${extensionSummary.migrationPercentage}% ([breakdown](${GITHUB_REPO}/metrics/${extensionMetricsFile}))`);
  }

  report.push('\n---\n');
  report.push(`*Generated: ${new Date().toISOString().split('T')[0]}*`);

  return report.join('\n');
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  const outputFileIndex = args.indexOf('--output');
  const outputFile = outputFileIndex !== -1 && args[outputFileIndex + 1]
    ? args[outputFileIndex + 1]
    : null;

  console.log('📊 Generating Slack report...\n');

  // Load config
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ config.json not found');
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  // Load migration targets
  if (!fs.existsSync(MIGRATION_TARGETS_PATH)) {
    console.error('❌ migration-targets.json not found');
    process.exit(1);
  }
  const migrationTargets = JSON.parse(fs.readFileSync(MIGRATION_TARGETS_PATH, 'utf8'));

  // Generate report
  const report = generateReport(config, migrationTargets);

  // Output
  if (outputFile) {
    fs.writeFileSync(outputFile, report);
    console.log(`✅ Report written to ${outputFile}`);
  } else {
    console.log(report);
  }

  console.log('\n✨ Done!\n');
}

main();
