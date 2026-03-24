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
 *   - Source category (local-oneoff, platform-primitive, third-party, mixed)
 *   - Canonical source (best single representative import path)
 *   - Code owner attribution via CODEOWNERS
 *   - Fuzzy-match suggestions against current MMDS component list
 *
 * Usage:
 *   node scripts/discover-untracked.js --project extension
 *   node scripts/discover-untracked.js --project mobile
 *   node scripts/discover-untracked.js --project extension --json
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const { glob } = require('glob');
const path = require('path');
const babelParser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { program } = require('commander');
const chalk = require('chalk');
const ExcelJS = require('exceljs');
const CodeOwnersParser = require('./codeowners-parser');

// ─── CLI ────────────────────────────────────────────────────────────────────

program
  .description('Discover untracked components that could use MMDS replacements')
  .requiredOption('-p, --project <name>', 'Project to scan (extension, mobile)')
  .option('-c, --config <path>', 'Path to config file', path.join(__dirname, '..', 'config.json'))
  .option('--json', 'Output results as JSON')
  .option('--min-instances <n>', 'Minimum instances to include in report', '5')
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

// ─── Source classification ───────────────────────────────────────────────────

/**
 * Classify a single import source path.
 * Returns 'local-oneoff', 'platform-primitive', or 'third-party'.
 */
function classifySource(source) {
  if (!source || source === '(local or re-export)') return 'local-oneoff';
  if (source.startsWith('.') || source.startsWith('/')) return 'local-oneoff';
  if (
    source === 'react-native' ||
    source.startsWith('react-native-') ||
    source.startsWith('expo-') ||
    source.startsWith('@expo/')
  ) return 'platform-primitive';
  return 'third-party';
}

/**
 * Determine the dominant source category across a set of import sources.
 * Returns 'mixed' when a component is imported from both local and non-local sources.
 */
function getDominantCategory(sources) {
  let hasLocal = false;
  let hasPrimitive = false;
  let hasThirdParty = false;

  for (const s of sources) {
    const cat = classifySource(s);
    if (cat === 'local-oneoff') hasLocal = true;
    else if (cat === 'platform-primitive') hasPrimitive = true;
    else hasThirdParty = true;
  }

  if (hasLocal && (hasPrimitive || hasThirdParty)) return 'mixed';
  if (hasLocal) return 'local-oneoff';
  if (hasPrimitive) return 'platform-primitive';
  return 'third-party';
}

/**
 * Return the single most informative canonical source string for a component.
 * Prefers the local relative path with the most segments (most context).
 * Falls back to the first external package name.
 */
function canonicalizeSource(sources) {
  if (!sources || sources.length === 0) return '—';

  // Find the longest normalised local path (strips leading ../)
  const localNormalized = sources
    .filter(s => s !== '(local or re-export)' && (s.startsWith('.') || s.startsWith('/')))
    .map(s => {
      const normalized = s.replace(/^(\.\.\/)*/g, '').replace(/^\.\//, '');
      return { normalized, segments: normalized.split('/').filter(Boolean).length };
    })
    .filter(p => p.segments > 0)
    .sort((a, b) => b.segments - a.segments);

  if (localNormalized.length > 0) {
    return localNormalized[0].normalized;
  }

  const external = sources.find(s => s !== '(local or re-export)');
  return external ?? '(local)';
}

// ─── Heuristic filtering ─────────────────────────────────────────────────────

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

  return suggestions.slice(0, 3);
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

// ─── CODEOWNERS ──────────────────────────────────────────────────────────────

let codeOwnersParser = null;
let repoRootPath = null;

/**
 * Resolve the primary code owner for a given file path.
 * Converts the file path to a path relative to the repo root before lookup.
 */
function resolveOwner(filePath) {
  if (!codeOwnersParser) return '@unknown';

  const absoluteFilePath = path.resolve(process.cwd(), filePath);
  if (repoRootPath) {
    const relativePath = path.relative(repoRootPath, absoluteFilePath).replace(/\\/g, '/');
    if (relativePath && !relativePath.startsWith('..')) {
      return codeOwnersParser.getPrimaryOwner(relativePath);
    }
  }
  return codeOwnersParser.getPrimaryOwner(filePath);
}

// ─── File processing ────────────────────────────────────────────────────────

/**
 * Process a single file: extract all JSX component usage with import sources.
 * Returns an array of { component, category, importSource, filePath }.
 */
function processFile(filePath, content, deprecatedComponents, currentPackages) {
  const usages = [];

  // Track all imports: componentName → { source, category }
  const allImports = new Map();

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

      const normalizedImport = importPath.replace(/\\/g, '/');
      let isDeprecated = false;

      for (const [, compConfig] of Object.entries(deprecatedComponents)) {
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

  // Derive repo root from file pattern
  if (filePattern.startsWith('repos/')) {
    // Relative submodule path: repos/metamask-extension/...
    const parts = filePattern.split('/');
    if (parts.length >= 2) {
      repoRootPath = path.resolve(process.cwd(), parts[0], parts[1]);
    }
  } else if (path.isAbsolute(filePattern)) {
    // Absolute path: walk up from the glob root to find the repo root (.git or CODEOWNERS)
    const globRoot = filePattern.split('**')[0].replace(/\/$/, '');
    let dir = globRoot;
    while (dir && dir !== path.dirname(dir)) {
      if (fsSync.existsSync(path.join(dir, '.git')) || fsSync.existsSync(path.join(dir, '.github', 'CODEOWNERS'))) {
        repoRootPath = dir;
        break;
      }
      dir = path.dirname(dir);
    }
  }
  if (!repoRootPath) {
    repoRootPath = process.cwd();
  }

  // Initialize CODEOWNERS parser
  const codeownersCandidates = [
    path.join(repoRootPath, '.github', 'CODEOWNERS'),
    path.join(repoRootPath, 'CODEOWNERS'),
  ];
  const codeownersPath = codeownersCandidates.find(c => fsSync.existsSync(c));
  if (codeownersPath) {
    codeOwnersParser = new CodeOwnersParser(codeownersPath);
    console.log(chalk.blue(`  ✓ Loaded CODEOWNERS from ${path.relative(process.cwd(), codeownersPath)}`));
  } else {
    console.log(chalk.yellow('  ⚠ CODEOWNERS file not found, skipping code owner attribution'));
  }

  console.log(chalk.blue(`\n  Discovering untracked components in: ${options.project}\n`));

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
      const usages = processFile(filePath, content, deprecatedComponents, currentPackages);
      allUsages.push(...usages);
      filesProcessed++;
    } catch {
      // skip unreadable files
    }
  }

  console.log(chalk.gray(`  Processed ${filesProcessed} files, found ${allUsages.length} total JSX usages\n`));

  // ─── Aggregate ──────────────────────────────────────────────────────────

  const untrackedMap = new Map();

  for (const usage of allUsages) {
    if (usage.category !== 'untracked') continue;

    const owner = resolveOwner(usage.filePath);

    if (!untrackedMap.has(usage.component)) {
      untrackedMap.set(usage.component, {
        instances: 0,
        files: new Set(),
        importSources: new Set(),
        ownerInstances: new Map(),
      });
    }

    const entry = untrackedMap.get(usage.component);
    entry.instances++;
    entry.files.add(usage.filePath);
    entry.importSources.add(usage.importSource);
    entry.ownerInstances.set(owner, (entry.ownerInstances.get(owner) || 0) + 1);
  }

  // Build sorted component list
  const minInstances = parseInt(options.minInstances, 10) || 5;

  const sorted = Array.from(untrackedMap.entries())
    .filter(([, data]) => data.instances >= minInstances)
    .map(([name, data]) => {
      const sources = Array.from(data.importSources);
      const codeOwnerBreakdown = Object.fromEntries(data.ownerInstances.entries());
      const codeOwners = Array.from(data.ownerInstances.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([owner]) => owner);

      return {
        component: name,
        instances: data.instances,
        fileCount: data.files.size,
        sourceCategory: getDominantCategory(sources),
        canonicalSource: canonicalizeSource(sources),
        importSources: sources,
        mmdsMatches: suggestMMDSMatches(name, currentComponents),
        codeOwners,
        codeOwnerBreakdown,
      };
    })
    .sort((a, b) => b.instances - a.instances);

  const replaceable = sorted.filter(c => c.mmdsMatches.length > 0);
  const candidates = sorted.filter(c => c.mmdsMatches.length === 0);

  // ─── Summary stats ────────────────────────────────────────────────────

  const trackedDeprecated = allUsages.filter(u => u.category === 'deprecated').length;
  const trackedMMDS = allUsages.filter(u => u.category === 'current').length;
  const trackedUntracked = allUsages.filter(u => u.category === 'untracked').length;
  const replaceableInstances = replaceable.reduce((sum, c) => sum + c.instances, 0);

  // All unique teams (excluding @unknown)
  const allTeams = new Set();
  for (const comp of [...replaceable, ...candidates]) {
    for (const owner of comp.codeOwners) {
      if (owner !== '@unknown') allTeams.add(owner);
    }
  }
  const teams = Array.from(allTeams).sort();

  // Summary-level code owner breakdown
  const summaryCodeOwnerBreakdown = {};
  for (const comp of replaceable) {
    for (const [owner, count] of Object.entries(comp.codeOwnerBreakdown)) {
      if (owner === '@unknown') continue;
      if (!summaryCodeOwnerBreakdown[owner]) {
        summaryCodeOwnerBreakdown[owner] = { replaceableComponents: 0, futureDSComponents: 0, replaceableInstances: 0 };
      }
      summaryCodeOwnerBreakdown[owner].replaceableComponents++;
      summaryCodeOwnerBreakdown[owner].replaceableInstances += count;
    }
  }
  for (const comp of candidates) {
    for (const owner of comp.codeOwners) {
      if (owner === '@unknown') continue;
      if (!summaryCodeOwnerBreakdown[owner]) {
        summaryCodeOwnerBreakdown[owner] = { replaceableComponents: 0, futureDSComponents: 0, replaceableInstances: 0 };
      }
      summaryCodeOwnerBreakdown[owner].futureDSComponents++;
    }
  }

  // ─── Build output object ───────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0];

  const output = {
    project: options.project,
    date: today,
    teams,
    summary: {
      filesScanned: filesProcessed,
      totalJSXUsages: allUsages.length,
      trackedDeprecated,
      trackedMMDS,
      untrackedTotal: trackedUntracked,
      uniqueUntrackedComponents: sorted.length,
      replaceableNow: replaceable.length,
      replaceableInstances,
      futureDSCandidates: candidates.length,
      codeOwnerBreakdown: summaryCodeOwnerBreakdown,
    },
    replaceableWithMMDS: replaceable,
    futureDSCandidates: candidates,
  };

  if (options.json) {
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
  console.log(chalk.gray(`    Unique untracked (≥${minInstances} uses): ${sorted.length}`));
  console.log(chalk.gray(`    Replaceable instances:      ${replaceableInstances}`));
  console.log(chalk.gray(`    Teams with one-offs:        ${teams.length}\n`));

  if (replaceable.length > 0) {
    console.log(chalk.bold.green('\n  ┌─────────────────────────────────────────────────────────┐'));
    console.log(chalk.bold.green('  │  POTENTIAL MMDS REPLACEMENTS (could migrate today)      │'));
    console.log(chalk.bold.green('  └─────────────────────────────────────────────────────────┘\n'));

    console.log(chalk.gray('  Rank  Component                   Instances  Files  Best MMDS Match          Conf      Category'));
    console.log(chalk.gray('  ────  ─────────────────────────   ─────────  ─────  ───────────────────────  ────────  ─────────────'));

    replaceable.forEach((c, i) => {
      const bestMatch = c.mmdsMatches[0];
      const confColor = bestMatch.confidence === 'exact' ? chalk.green
        : bestMatch.confidence === 'high' ? chalk.yellow
        : chalk.gray;

      console.log(
        `  ${String(i + 1).padStart(4)}  ${c.component.padEnd(28)} ${String(c.instances).padStart(9)}  ${String(c.fileCount).padStart(5)}  ${bestMatch.component.padEnd(23)}  ${confColor(bestMatch.confidence.padEnd(8))}  ${c.sourceCategory}`
      );
      console.log(chalk.gray(`        └─ ${c.canonicalSource}`));
    });
  }

  if (candidates.length > 0) {
    console.log(chalk.bold.cyan('\n\n  ┌─────────────────────────────────────────────────────────┐'));
    console.log(chalk.bold.cyan('  │  FUTURE DS CANDIDATES (no current MMDS equivalent)      │'));
    console.log(chalk.bold.cyan('  └─────────────────────────────────────────────────────────┘\n'));

    console.log(chalk.gray('  Rank  Component                   Instances  Files  Canonical Source'));
    console.log(chalk.gray('  ────  ─────────────────────────   ─────────  ─────  ──────────────────────────────'));

    candidates.forEach((c, i) => {
      const sourceDisplay = c.canonicalSource.length > 45
        ? '...' + c.canonicalSource.slice(-42)
        : c.canonicalSource;

      console.log(
        `  ${String(i + 1).padStart(4)}  ${c.component.padEnd(28)} ${String(c.instances).padStart(9)}  ${String(c.fileCount).padStart(5)}  ${chalk.gray(sourceDisplay)}`
      );
    });
  }

  console.log(chalk.bold('\n═══════════════════════════════════════════════════════════════\n'));

  // Write JSON
  const outputDir = path.join(__dirname, '..', 'metrics');
  const outputPath = path.join(outputDir, `${options.project}-untracked-${today}.json`);
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(chalk.green(`  ✓ JSON report written to ${path.relative(process.cwd(), outputPath)}`));

  // Write XLSX
  const xlsxPath = path.join(outputDir, `${options.project}-untracked-${today}.xlsx`);
  const workbook = new ExcelJS.Workbook();
  const headerStyle = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } } };

  // Sheet 1: Potential MMDS Replacements
  const replaceSheet = workbook.addWorksheet('Potential MMDS Replacements');
  replaceSheet.addRow(['Rank', 'Component', 'Instances', 'Files', 'Source Category', 'Canonical Source', 'Best MMDS Match', 'Confidence', 'Top Teams']);
  replaceSheet.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });

  replaceable.forEach((c, i) => {
    const bestMatch = c.mmdsMatches[0];
    replaceSheet.addRow([
      i + 1,
      c.component,
      c.instances,
      c.fileCount,
      c.sourceCategory,
      c.canonicalSource,
      bestMatch?.component || '',
      bestMatch?.confidence || '',
      c.codeOwners.filter(o => o !== '@unknown').slice(0, 3).join(', '),
    ]);
  });

  replaceSheet.columns = [
    { width: 6 }, { width: 35 }, { width: 12 }, { width: 8 },
    { width: 18 }, { width: 40 }, { width: 25 }, { width: 12 }, { width: 55 },
  ];

  // Sheet 2: Future DS Candidates
  const candidateSheet = workbook.addWorksheet('Future DS Candidates');
  candidateSheet.addRow(['Rank', 'Component', 'Instances', 'Files', 'Source Category', 'Canonical Source', 'Top Teams']);
  candidateSheet.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });

  candidates.forEach((c, i) => {
    candidateSheet.addRow([
      i + 1,
      c.component,
      c.instances,
      c.fileCount,
      c.sourceCategory,
      c.canonicalSource,
      c.codeOwners.filter(o => o !== '@unknown').slice(0, 3).join(', '),
    ]);
  });

  candidateSheet.columns = [
    { width: 6 }, { width: 35 }, { width: 12 }, { width: 8 },
    { width: 18 }, { width: 40 }, { width: 55 },
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
  summarySheet.addRow([`Unique Untracked (≥${minInstances} uses)`, sorted.length]);
  summarySheet.addRow(['Potential MMDS Replacements', replaceable.length]);
  summarySheet.addRow(['Replaceable Instances', replaceableInstances]);
  summarySheet.addRow(['Future DS Candidates', candidates.length]);
  summarySheet.addRow(['Teams with One-offs', teams.length]);
  summarySheet.columns = [{ width: 35 }, { width: 15 }];

  await workbook.xlsx.writeFile(xlsxPath);
  console.log(chalk.green(`  ✓ XLSX report written to ${path.relative(process.cwd(), xlsxPath)}\n`));
}

main().catch(err => {
  console.error(chalk.red(`Error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
