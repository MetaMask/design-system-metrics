#!/usr/bin/env node

/**
 * Fetch Migration Target Components from Jira Epics
 *
 * Fetches the list of components planned for migration from Jira epics:
 * - DSYS-272: Mobile component migration
 * - DSYS-302: Extension component migration
 *
 * Outputs migration-targets.json with curated component lists
 */

const CLOUD_ID = '8831f492-a12c-460e-ac1b-400f1b09e935';

const EPICS = {
  mobile: 'DSYS-272',
  extension: 'DSYS-302'
};

/**
 * Fetch all child issues from a Jira epic
 * Note: This is a placeholder - actual implementation would use Atlassian MCP
 */
async function fetchEpicComponents(epicKey) {
  console.log(`\n📋 Fetching components from ${epicKey}...`);

  // In real implementation, this would call Atlassian MCP
  // For now, we'll output instructions
  console.log(`\nTo fetch via Atlassian MCP, run:`);
  console.log(`mcp__atlassian__searchJiraIssuesUsingJql({`);
  console.log(`  cloudId: "${CLOUD_ID}",`);
  console.log(`  jql: "parent = ${epicKey} OR 'Epic Link' = ${epicKey}",`);
  console.log(`  fields: ["summary"]`);
  console.log(`})`);

  // Placeholder: return known mobile components for now
  if (epicKey === 'DSYS-272') {
    return [
      'Accordion',
      'ActionListItem',
      'BottomSheet',
      'BottomSheetHeader',
      'ButtonFilter',
      'ButtonHero',
      'ButtonSemantic',
      'HeaderCollapsibleSubpage',
      'HeaderStackedStandard',
      'HeaderStackedSubpage',
      'Input',
      'ListItem',
      'MainActionButton',
      'RadioButton',
      'SensitiveText',
      'TabEmptyState',
      'Tag',
      'TextField',
      'TextFieldSearch'
    ];
  }

  // Extension components will be fetched when implemented
  return [];
}

/**
 * Extract component name from Jira issue summary
 * Pattern: "Migrate [ComponentName] Component to MMDS" -> "ComponentName"
 */
function extractComponentName(summary) {
  const match = summary.match(/Migrate\s+(\w+)\s+(?:Component\s+)?to\s+MMDS/i);
  return match ? match[1] : null;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Fetching migration target components from Jira...\n');

  const migrationTargets = {
    mobile: {
      source: EPICS.mobile,
      components: [],
      fetchedAt: new Date().toISOString().split('T')[0]
    },
    extension: {
      source: EPICS.extension,
      components: [],
      fetchedAt: new Date().toISOString().split('T')[0]
    }
  };

  // Fetch mobile components
  try {
    migrationTargets.mobile.components = await fetchEpicComponents(EPICS.mobile);
    console.log(`✅ Mobile: Found ${migrationTargets.mobile.components.length} components`);
  } catch (err) {
    console.error(`❌ Failed to fetch mobile components: ${err.message}`);
  }

  // Fetch extension components
  try {
    migrationTargets.extension.components = await fetchEpicComponents(EPICS.extension);
    console.log(`✅ Extension: Found ${migrationTargets.extension.components.length} components`);
  } catch (err) {
    console.error(`❌ Failed to fetch extension components: ${err.message}`);
  }

  // Output results
  const fs = require('fs');
  const path = require('path');
  const outputPath = path.join(__dirname, '..', 'migration-targets.json');

  fs.writeFileSync(outputPath, JSON.stringify(migrationTargets, null, 2));

  console.log(`\n💾 Written to ${outputPath}`);
  console.log('\n📊 Summary:');
  console.log(`   Mobile (${EPICS.mobile}): ${migrationTargets.mobile.components.length} components`);
  console.log(`   Extension (${EPICS.extension}): ${migrationTargets.extension.components.length} components`);
  console.log('\n✨ Done!\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
