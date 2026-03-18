#!/usr/bin/env node

/**
 * Discover untracked components in the codebase
 *
 * Scans ALL JSX usage across project files and categorises each component as:
 *   - tracked-deprecated  (from component-library paths)
 *   - tracked-mmds        (from @metamask/design-system-* packages)
 *   - untracked           (everything else)
 *
 * Outputs a frequency-ranked report of untracked components with:
 *   - Instance counts and file counts
 *   - Import sources (local path vs third-party package)
 *   - Fuzzy-match suggestions against current MMDS component list
 *
 * Usage:
 *   node scripts/discover-untracked.js --project extension
 *   node scripts/discover-untracked.js --project mobile
 *   node scripts/discover-untracked.js --project extension --json
 */

const fs = require('fs').promises;
const { glob } = require('glob');
const path = require('path');
const babelParser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { program } = require('commander');
const chalk = require('chalk');
const ExcelJS = require('exceljs');

// ─── CLI ────────────────────────────────────────────────────────────────────

program
  .description('Discover untracked components that could use MMDS replacements')
  .requiredOption('-p, --project <name>', 'Project to scan (extension, mobile)')
  .option('-c, --config <path>', 'Path to config file', path.join(__dirname, '..', 'config.json'))
  .option('--json', 'Output results as JSON')
  .option('--min-instances <n>', 'Minimum instances to include in report', '2')
  .parse(process.argv);

const options = program.opts();

// ─── React / framework internals to ignore ──────────────────────────────────

const FRAMEWORK_COMPONENTS = new Set([
  // React
  'Fragment', 'Suspense', 'StrictMode', 'Profiler', 'React',

  // React Router
  'Router', 'BrowserRouter', 'HashRouter', 'MemoryRouter',
  'Route', 'Routes', 'Switch', 'Link', 'NavLink', 'Redirect',
  'Navigate', 'Outlet',

  // React Native navigation
  'NavigationContainer', 'Stack', 'Tab', 'Drawer',

  // Providers / wrappers (not UI components)
  'Provider', 'ThemeProvider', 'IntlProvider', 'QueryClientProvider',

  // Error boundaries
  'ErrorBoundary',

  // Testing
  'MockComponent', 'TestWrapper',
]);

/**
 * Heuristic: should this component name be ignored?
 * Filters out non-UI exports similar to scanner.js logic.
 */
function shouldIgnore(name) {
  if (!name) return true;

  // Must be PascalCase (first char uppercase)
  if (name[0] !== name[0].toUpperCase() || name[0] === name[0].toLowerCase()) return true;

  // Framework / infrastructure components
  if (FRAMEWORK_COMPONENTS.has(name)) return true;

  // ALL_CAPS_CONSTANTS
  if (/^[A-Z_0-9]+$/.test(name)) return true;

  // Common non-component patterns
  if (/^(use|get|set|is|has|should|fetch|calculate|format|parse|handle|render|with)[A-Z]/.test(name)) return true;

  // TypeScript types / enums
  if (/(?:Type|Types|Enum|Props|State|Action|Reducer|Selector|Context|Provider|Consumer|Hook)$/.test(name)) return true;

  return false;
}

// ─── Fuzzy matching ─────────────────────────────────────────────────────────

/**
 * Suggest possible MMDS matches for an untracked component name.
 * Returns array of { component, confidence } sorted by confidence.
 */
function suggestMMDSMatches(name, mmdsComponents) {
  const suggestions = [];
  const nameLower = name.toLowerCase();

  for (const mmds of mmdsComponents) {
    const mmdsLower = mmds.toLowerCase();
    let confidence = null;

    // Exact match (different casing only)
    if (nameLower === mmdsLower) {
      confidence = 'exact';
    }
    // Name ends with the MMDS name (e.g., CustomButton → Button)
    else if (nameLower.endsWith(mmdsLower)) {
      confidence = 'high';
    }
    // Name starts with the MMDS name (e.g., ButtonCustom → Button)
    else if (nameLower.startsWith(mmdsLower)) {
      confidence = 'high';
    }
    // MMDS name is contained within the name (e.g., StyledNetworkAvatar → AvatarNetwork)
    else if (nameLower.includes(mmdsLower) && mmdsLower.length >= 4) {
      confidence = 'medium';
    }
    // Name is contained in the MMDS name (e.g., Avatar → AvatarBase)
    else if (mmdsLower.includes(nameLower) && nameLower.length >= 4) {
      confidence = 'medium';
    }
    // Word overlap (e.g., NetworkBadge → BadgeNetwork)
    else {
      const nameWords = splitPascalCase(name);
      const mmdsWords = splitPascalCase(mmds);
      const overlap = nameWords.filter(w => mmdsWords.includes(w));
      if (overlap.length > 0 && overlap.length >= Math.min(nameWords.length, mmdsWords.length) * 0.5) {
        confidence = 'medium';
      }
    }

    if (confidence) {
      suggestions.push({ component: mmds, confidence });
    }
  }

  // Sort: exact > high > medium
  const order = { exact: 0, high: 1, medium: 2 };
  suggestions.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return suggestions.slice(0, 3); // top 3
}

/**
 * Split PascalCase into lowercase words.
 * e.g., "AvatarNetwork" → ["avatar", "network"]
 */
function splitPascalCase(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .map(w => w.toLowerCase());
}

// ─── File processing ────────────────────────────────────────────────────────

/**
 * Process a single file: extract all JSX component usage with import sources.
 *
 * Returns Map<componentName, { source: string, category: string }>
 * where category is 'deprecated', 'current', or 'untracked'.
 */
function processFile(filePath, content, deprecatedComponents, currentComponentsSet, currentPackages, ignoreFolders) {
  const usages = []; // { component, category, importSource, filePath }

  // Track all imports: componentName → importSource
  const allImports = new Map();
  // Track which components are from known sources
  const knownComponents = new Set();

  let ast;
  try {
    ast = babelParser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
      attachComment: false,
      errorRecovery: true,
    });
  } catch {
    return usages;
  }

  // First pass: collect all imports
  traverse(ast, {
    ImportDeclaration({ node }) {
      const importPath = node.source.value;
      let category = 'untracked';

      // Check deprecated
      const normalizedImport = importPath.replace(/\\/g, '/');
      let isDeprecated = false;

      for (const [compName, compConfig] of Object.entries(deprecatedComponents)) {
        for (const componentPath of compConfig.paths) {
          const normalizedCompPath = componentPath.replace(/\\/g, '/');
          if (
            normalizedImport === normalizedCompPath ||
            normalizedImport.endsWith(normalizedCompPath) ||
            (normalizedImport.includes('/component-library') && normalizedCompPath.includes('/component-library'))
          ) {
            isDeprecated = true;
            break;
          }
        }
        if (isDeprecated) break;
      }

      if (isDeprecated) {
        category = 'deprecated';
      } else if (currentPackages.some(pkg => importPath === pkg || importPath.startsWith(`${pkg}/`))) {
        category = 'current';
      }

      node.specifiers.forEach(specifier => {
        const localName = specifier.local?.name;
        if (localName) {
          allImports.set(localName, { source: importPath, category });
          if (category !== 'untracked') {
            knownComponents.add(localName);
          }
        }
      });
    },
  });

  // Second pass: collect JSX usage
  traverse(ast, {
    JSXOpeningElement({ node }) {
      let componentName = null;

      if (node.name?.type === 'JSXIdentifier') {
        componentName = node.name.name;
      } else if (node.name?.type === 'JSXMemberExpression') {
        // For <Foo.Bar>, take the root object name
        let current = node.name;
        while (current.object) {
          current = current.object;
        }
        componentName = current.name;
      }

      if (!componentName || shouldIgnore(componentName)) return;

      const importInfo = allImports.get(componentName);

      if (importInfo) {
        usages.push({
          component: componentName,
          category: importInfo.category,
          importSource: importInfo.source,
          filePath,
        });
      } else {
        // Component used but not imported — likely defined locally in the file,
        // or imported via a barrel/re-export we didn't trace.
        // Still worth tracking if PascalCase.
        usages.push({
          component: componentName,
          category: 'untracked',
          importSource: '(local or re-export)',
          filePath,
        });
      }
    },
  });

  return usages;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Load config
  const configContent = await fs.readFile(options.config, 'utf8');
  const config = JSON.parse(configContent);
  const projectConfig = config.projects[options.project];

  if (!projectConfig) {
    console.error(chalk.red(`Project "${options.project}" not found in config.json`));
    process.exit(1);
  }

  const {
    ignoreFolders = [],
    filePattern,
    deprecatedComponents = {},
    currentComponents = [],
    currentPackages = [],
  } = projectConfig;

  const currentComponentsSet = new Set(currentComponents);

  console.log(chalk.blue(`\n🔍 Discovering untracked components in: ${options.project}\n`));

  // Glob files
  const files = await glob(filePattern, {
    ignore: [
      ...ignoreFolders.map(f => path.join(f, '**')),
      '**/*.test.{js,jsx,ts,tsx}',
      '**/*.spec.{js,jsx,ts,tsx}',
      '**/*.stories.{js,jsx,ts,tsx}',
      '**/__mocks__/**',
      '**/__tests__/**',
      '**/*.d.ts',
    ],
  });

  console.log(chalk.gray(`  Scanning ${files.length} files...\n`));

  // Process all files
  const allUsages = [];
  let filesProcessed = 0;

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const usages = processFile(filePath, content, deprecatedComponents, currentComponentsSet, currentPackages, ignoreFolders);
      allUsages.push(...usages);
      filesProcessed++;
    } catch (err) {
      // skip unreadable files
    }
  }

  console.log(chalk.gray(`  Processed ${filesProcessed} files, found ${allUsages.length} total JSX usages\n`));

  // ─── Aggregate ──────────────────────────────────────────────────────────

  // Aggregate untracked components
  const untrackedMap = new Map(); // name → { instances, files: Set, importSources: Set }

  for (const usage of allUsages) {
    if (usage.category !== 'untracked') continue;

    if (!untrackedMap.has(usage.component)) {
      untrackedMap.set(usage.component, {
        instances: 0,
        files: new Set(),
        importSources: new Set(),
      });
    }

    const entry = untrackedMap.get(usage.component);
    entry.instances++;
    entry.files.add(usage.filePath);
    entry.importSources.add(usage.importSource);
  }

  // Sort by instance count descending
  const sorted = Array.from(untrackedMap.entries())
    .map(([name, data]) => ({
      component: name,
      instances: data.instances,
      fileCount: data.files.size,
      importSources: Array.from(data.importSources),
      mmdsMatches: suggestMMDSMatches(name, currentComponents),
    }))
    .sort((a, b) => b.instances - a.instances);

  const minInstances = parseInt(options.minInstances, 10) || 2;
  const filtered = sorted.filter(c => c.instances >= minInstances);

  // Separate into two buckets
  const replaceable = filtered.filter(c => c.mmdsMatches.length > 0);
  const candidates = filtered.filter(c => c.mmdsMatches.length === 0);

  // ─── Summary stats ────────────────────────────────────────────────────

  const trackedDeprecated = allUsages.filter(u => u.category === 'deprecated').length;
  const trackedMMDS = allUsages.filter(u => u.category === 'current').length;
  const trackedUntracked = allUsages.filter(u => u.category === 'untracked').length;

  // ─── Output ────────────────────────────────────────────────────────────

  if (options.json) {
    const output = {
      project: options.project,
      date: new Date().toISOString().split('T')[0],
      summary: {
        filesScanned: filesProcessed,
        totalJSXUsages: allUsages.length,
        trackedDeprecated,
        trackedMMDS,
        untrackedTotal: trackedUntracked,
        uniqueUntrackedComponents: filtered.length,
        replaceableNow: replaceable.length,
        futureDSCandidates: candidates.length,
      },
      replaceableWithMMDS: replaceable,
      futureDSCandidates: candidates,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ─── Console report ────────────────────────────────────────────────────

  console.log(chalk.bold('═══════════════════════════════════════════════════════════════'));
  console.log(chalk.bold(`  UNTRACKED COMPONENT DISCOVERY — ${options.project.toUpperCase()}`));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════\n'));

  console.log(chalk.white('  Overview:'));
  console.log(chalk.gray(`    Files scanned:              ${filesProcessed}`));
  console.log(chalk.gray(`    Total JSX component usages: ${allUsages.length}`));
  console.log(chalk.green(`    Tracked (MMDS):             ${trackedMMDS}`));
  console.log(chalk.yellow(`    Tracked (deprecated):       ${trackedDeprecated}`));
  console.log(chalk.red(`    Untracked:                  ${trackedUntracked}`));
  console.log(chalk.gray(`    Unique untracked (≥${minInstances} uses): ${filtered.length}\n`));

  // Section 1: Replaceable now
  if (replaceable.length > 0) {
    console.log(chalk.bold.green('\n  ┌─────────────────────────────────────────────────────────┐'));
    console.log(chalk.bold.green('  │  POTENTIAL MMDS REPLACEMENTS (could migrate today)      │'));
    console.log(chalk.bold.green('  └─────────────────────────────────────────────────────────┘\n'));

    console.log(chalk.gray('  Rank  Component                   Instances  Files  Best MMDS Match          Confidence'));
    console.log(chalk.gray('  ────  ─────────────────────────   ─────────  ─────  ───────────────────────  ──────────'));

    replaceable.forEach((c, i) => {
      const bestMatch = c.mmdsMatches[0];
      const confColor = bestMatch.confidence === 'exact' ? chalk.green
        : bestMatch.confidence === 'high' ? chalk.yellow
        : chalk.gray;

      console.log(
        `  ${String(i + 1).padStart(4)}  ${c.component.padEnd(28)} ${String(c.instances).padStart(9)}  ${String(c.fileCount).padStart(5)}  ${bestMatch.component.padEnd(23)}  ${confColor(bestMatch.confidence)}`
      );

      // Show import sources (abbreviated)
      const sources = c.importSources
        .filter(s => s !== '(local or re-export)')
        .slice(0, 2);
      if (sources.length > 0) {
        console.log(chalk.gray(`        └─ from: ${sources.join(', ')}`));
      }
    });
  }

  // Section 2: Future DS candidates
  if (candidates.length > 0) {
    console.log(chalk.bold.cyan('\n\n  ┌─────────────────────────────────────────────────────────┐'));
    console.log(chalk.bold.cyan('  │  FUTURE DS CANDIDATES (no current MMDS equivalent)      │'));
    console.log(chalk.bold.cyan('  └─────────────────────────────────────────────────────────┘\n'));

    console.log(chalk.gray('  Rank  Component                   Instances  Files  Import Source'));
    console.log(chalk.gray('  ────  ─────────────────────────   ─────────  ─────  ──────────────────────────────'));

    candidates.forEach((c, i) => {
      const source = c.importSources[0] || '(unknown)';
      const sourceDisplay = source.length > 45 ? '...' + source.slice(-42) : source;

      console.log(
        `  ${String(i + 1).padStart(4)}  ${c.component.padEnd(28)} ${String(c.instances).padStart(9)}  ${String(c.fileCount).padStart(5)}  ${chalk.gray(sourceDisplay)}`
      );
    });
  }

  console.log(chalk.bold('\n═══════════════════════════════════════════════════════════════\n'));

  // Write JSON alongside console output
  const outputDir = path.join(__dirname, '..', 'metrics');
  const today = new Date().toISOString().split('T')[0];
  const outputPath = path.join(outputDir, `${options.project}-untracked-${today}.json`);

  const output = {
    project: options.project,
    date: today,
    summary: {
      filesScanned: filesProcessed,
      totalJSXUsages: allUsages.length,
      trackedDeprecated,
      trackedMMDS,
      untrackedTotal: trackedUntracked,
      uniqueUntrackedComponents: filtered.length,
      replaceableNow: replaceable.length,
      futureDSCandidates: candidates.length,
    },
    replaceableWithMMDS: replaceable,
    futureDSCandidates: candidates,
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(chalk.green(`  ✓ JSON report written to ${path.relative(process.cwd(), outputPath)}`));

  // Write XLSX spreadsheet
  const xlsxPath = path.join(outputDir, `${options.project}-untracked-${today}.xlsx`);
  const workbook = new ExcelJS.Workbook();

  const headerStyle = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } } };

  // Sheet 1: Potential MMDS Replacements
  const replaceSheet = workbook.addWorksheet('Potential MMDS Replacements');
  const replaceHeaders = ['Rank', 'Component', 'Instances', 'Files', 'Best MMDS Match', 'Confidence', 'Import Sources'];
  replaceSheet.addRow(replaceHeaders);
  replaceSheet.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });

  replaceable.forEach((c, i) => {
    const bestMatch = c.mmdsMatches[0];
    replaceSheet.addRow([
      i + 1,
      c.component,
      c.instances,
      c.fileCount,
      bestMatch?.component || '',
      bestMatch?.confidence || '',
      c.importSources.filter(s => s !== '(local or re-export)').join(', '),
    ]);
  });

  replaceSheet.columns = [
    { width: 6 }, { width: 35 }, { width: 12 }, { width: 8 },
    { width: 25 }, { width: 12 }, { width: 60 },
  ];

  // Sheet 2: Future DS Candidates
  const candidateSheet = workbook.addWorksheet('Future DS Candidates');
  const candidateHeaders = ['Rank', 'Component', 'Instances', 'Files', 'Import Sources'];
  candidateSheet.addRow(candidateHeaders);
  candidateSheet.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });

  candidates.forEach((c, i) => {
    candidateSheet.addRow([
      i + 1,
      c.component,
      c.instances,
      c.fileCount,
      c.importSources.filter(s => s !== '(local or re-export)').join(', '),
    ]);
  });

  candidateSheet.columns = [
    { width: 6 }, { width: 35 }, { width: 12 }, { width: 8 }, { width: 60 },
  ];

  // Sheet 3: Summary
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.addRow(['Metric', 'Value']);
  summarySheet.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });
  summarySheet.addRow(['Project', options.project]);
  summarySheet.addRow(['Date', today]);
  summarySheet.addRow(['Files Scanned', filesProcessed]);
  summarySheet.addRow(['Total JSX Usages', allUsages.length]);
  summarySheet.addRow(['Tracked (MMDS)', trackedMMDS]);
  summarySheet.addRow(['Tracked (Deprecated)', trackedDeprecated]);
  summarySheet.addRow(['Untracked', trackedUntracked]);
  summarySheet.addRow(['Unique Untracked (≥' + minInstances + ' uses)', filtered.length]);
  summarySheet.addRow(['Potential MMDS Replacements', replaceable.length]);
  summarySheet.addRow(['Future DS Candidates', candidates.length]);
  summarySheet.columns = [{ width: 35 }, { width: 15 }];

  await workbook.xlsx.writeFile(xlsxPath);
  console.log(chalk.green(`  ✓ XLSX report written to ${path.relative(process.cwd(), xlsxPath)}\n`));
}

main().catch(err => {
  console.error(chalk.red(`Error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
