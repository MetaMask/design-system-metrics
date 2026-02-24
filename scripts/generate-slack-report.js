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

/**
 * Get the latest metrics file for a project
 */
function getLatestMetricsFile(project) {
  const files = fs.readdirSync(METRICS_DIR);
  const projectFiles = files
    .filter(f => f.startsWith(`${project}-component-metrics-`) && f.endsWith('.xlsx'))
    .sort()
    .reverse();

  return projectFiles.length > 0 ? path.join(METRICS_DIR, projectFiles[0]) : null;
}

/**
 * Count MMDS components mapped in config
 */
function countMappedComponents(deprecatedComponents) {
  return Object.values(deprecatedComponents).filter(comp =>
    comp.replacement &&
    comp.replacement.package &&
    comp.replacement.package.includes('@metamask/design-system')
  ).length;
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
  const mobileMappedCount = countMappedComponents(mobileConfig.deprecatedComponents);
  const mobileMetricsFile = getLatestMetricsFile('mobile');
  const mobileNewComponents = getNewComponents('mobile');

  report.push('  * **Mobile**');
  report.push(`    * Total: ${mobileMappedCount} [components](${MMDS_RN_COMPONENTS})`);
  report.push(`    * Usage: [Placeholder] instances in mobile codebase`);
  if (mobileNewComponents.length > 0) {
    report.push(`    * New components: ${mobileNewComponents.join(', ')}`);
  }

  // Extension section
  const extensionConfig = config.projects.extension;
  const extensionMappedCount = countMappedComponents(extensionConfig.deprecatedComponents);
  const extensionMetricsFile = getLatestMetricsFile('extension');
  const extensionNewComponents = getNewComponents('extension');

  report.push('  * **Extension**');
  report.push(`    * Total: ${extensionMappedCount} [components](${MMDS_REACT_COMPONENTS})`);
  report.push(`    * Usage: [Placeholder] instances in extension codebase`);
  if (extensionNewComponents.length > 0) {
    report.push(`    * New components: ${extensionNewComponents.join(', ')}`);
  }

  // Migration Progress section
  report.push('* **Migration Progress**');

  // Mobile migration
  report.push('  * **Mobile**');
  const mobileTargets = migrationTargets.mobile?.components?.length || 0;
  report.push(`    * Target components: ${mobileTargets} components planned for migration (${migrationTargets.mobile?.source || 'N/A'})`);
  report.push(`    * Migrated to MMDS: ${mobileMappedCount}/${mobileMappedCount + mobileTargets} (${Math.round((mobileMappedCount / (mobileMappedCount + mobileTargets)) * 100)}%)`);
  if (mobileMetricsFile) {
    const fileName = path.basename(mobileMetricsFile);
    report.push(`    * Instance replacement: [Placeholder]% ([breakdown](./metrics/${fileName}))`);
  }

  // Extension migration
  report.push('  * **Extension**');
  const extensionTargets = migrationTargets.extension?.components?.length || 0;
  report.push(`    * Target components: ${extensionTargets} components planned for migration (${migrationTargets.extension?.source || 'N/A'})`);
  report.push(`    * Migrated to MMDS: ${extensionMappedCount}/${extensionMappedCount + extensionTargets} (${Math.round((extensionMappedCount / (extensionMappedCount + extensionTargets)) * 100)}%)`);
  if (extensionMetricsFile) {
    const fileName = path.basename(extensionMetricsFile);
    report.push(`    * Instance replacement: [Placeholder]% ([breakdown](./metrics/${fileName}))`);
  }

  report.push('\n---\n');
  report.push('*Note: Instance replacement percentages require Excel parsing and will be added in future updates.*');
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
