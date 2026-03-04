#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const { Linter } = require(path.join(
  __dirname,
  '..',
  'dashboard',
  'node_modules',
  'eslint',
));
const tsEslintParser = require(path.join(
  __dirname,
  '..',
  'dashboard',
  'node_modules',
  '@typescript-eslint',
  'parser',
  'dist',
  'index.js',
));

function printHelpAndExit() {
  console.log(`Component Props Audit

Usage:
  node scripts/component-props-audit.js --component AvatarBase [options]
  node scripts/component-props-audit.js --components AvatarBase,Button [options]

Options:
  --component <name>      Single component name to audit
  --components <list>     Comma-separated components to audit
  --projects <list>       Comma-separated projects (default: all in config)
  --config <path>         Config path (default: ./config.json)
  --date <yyyy-mm-dd>     Date for output filename (default: today)
  --output <path>         Custom output path
  --help                  Show this help
`);
  process.exit(0);
}

function parseArgs(argv) {
  const opts = {
    component: null,
    components: null,
    projects: null,
    config: path.join(__dirname, '..', 'config.json'),
    date: new Date().toISOString().split('T')[0],
    output: null,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    }

    if (arg === '--component' || arg === '-n') {
      opts.component = argv[++i];
      continue;
    }
    if (arg === '--components') {
      opts.components = argv[++i];
      continue;
    }
    if (arg === '--projects' || arg === '-p') {
      opts.projects = argv[++i];
      continue;
    }
    if (arg === '--config' || arg === '-c') {
      opts.config = argv[++i];
      continue;
    }
    if (arg === '--date') {
      opts.date = argv[++i];
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      opts.output = argv[++i];
      continue;
    }
  }

  if (!opts.component && !opts.components) {
    console.error('Error: --component or --components is required');
    process.exit(1);
  }

  return opts;
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function stripExtension(value) {
  return value.replace(/\.(jsx?|tsx?)$/i, '');
}

function normalizeImportPathForMatch(value) {
  let normalized = stripExtension(normalizePath(value));
  if (normalized.endsWith('/index')) {
    normalized = normalized.slice(0, -'/index'.length);
  }
  return normalized;
}

function getComponentPathCandidates(componentPath) {
  const filePath = normalizeImportPathForMatch(componentPath);
  const candidates = new Set([filePath]);

  const dirPath = normalizePath(path.posix.dirname(filePath));
  candidates.add(dirPath);

  const base = path.posix.basename(filePath);
  if (filePath.endsWith(`/${base}`) && dirPath.endsWith(`/${base}`)) {
    candidates.add(dirPath);
  }

  return Array.from(candidates);
}

function getComponentLibrarySubpath(value) {
  const marker = '/component-library/';
  const normalized = normalizeImportPathForMatch(value);
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  return normalized.slice(markerIndex + marker.length);
}

function isCodeFile(filePath) {
  return /\.(jsx?|tsx?)$/i.test(filePath);
}

function isTestFile(filePath) {
  return /\.test\.(jsx?|tsx?)$/i.test(filePath);
}

async function collectProjectFiles(rootFolder, ignoreFolders) {
  const files = [];
  const rootAbs = path.resolve(process.cwd(), rootFolder);
  const ignoreAbs = ignoreFolders.map((folder) => path.resolve(process.cwd(), folder));

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const normalizedFullPath = normalizePath(fullPath);

      if (ignoreAbs.some((ignored) => normalizedFullPath.startsWith(normalizePath(ignored)))) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!isCodeFile(entry.name) || isTestFile(entry.name)) {
        continue;
      }

      files.push(normalizePath(path.relative(process.cwd(), fullPath)));
    }
  }

  await walk(rootAbs);
  return files;
}

function matchDeprecatedPath(importPath, trackedEntries) {
  const normalizedImportPath = normalizeImportPathForMatch(importPath);

  for (const entry of trackedEntries) {
    for (const componentPath of entry.paths) {
      const candidates = getComponentPathCandidates(componentPath);
      for (const candidate of candidates) {
        if (normalizedImportPath === candidate) {
          return entry;
        }

        if (normalizedImportPath.endsWith(candidate)) {
          return entry;
        }

        if (normalizedImportPath.startsWith(`${candidate}/`)) {
          return entry;
        }

        // Match imports that differ only by leading app/ui root segments.
        const importCL = getComponentLibrarySubpath(normalizedImportPath);
        const candidateCL = getComponentLibrarySubpath(candidate);
        if (importCL && candidateCL) {
          if (
            importCL === candidateCL ||
            importCL.startsWith(`${candidateCL}/`) ||
            importCL.endsWith(`/${candidateCL}`) ||
            candidateCL.endsWith(`/${importCL}`)
          ) {
            return entry;
          }
        }
      }
    }
  }

  return null;
}

function normalizeExpressionSnippet(raw) {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '{expression}';
  }

  if (compact.length > 80) {
    return `{${compact.slice(0, 77)}...}`;
  }

  return `{${compact}}`;
}

function getPropValueLabel(attr, sourceCode) {
  if (!attr.value) {
    return 'true (shorthand)';
  }

  if (attr.value.type === 'Literal') {
    return JSON.stringify(attr.value.value);
  }

  if (attr.value.type !== 'JSXExpressionContainer') {
    return '{expression}';
  }

  const expression = attr.value.expression;
  if (!expression) {
    return '{expression}';
  }

  if (expression.type === 'Literal') {
    if (expression.value === null) {
      return 'null';
    }
    return String(expression.value);
  }

  return normalizeExpressionSnippet(sourceCode.getText(expression));
}

function createCounter() {
  return {
    totalInstances: 0,
    files: new Set(),
    props: {},
  };
}

function trackProp(counter, propName, valueLabel) {
  if (!counter.props[propName]) {
    counter.props[propName] = {
      count: 0,
      values: {},
    };
  }

  counter.props[propName].count += 1;
  counter.props[propName].values[valueLabel] =
    (counter.props[propName].values[valueLabel] || 0) + 1;
}

function counterToJson(counter) {
  const props = Object.fromEntries(
    Object.entries(counter.props)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, data]) => [
        name,
        {
          count: data.count,
          values: Object.fromEntries(
            Object.entries(data.values).sort((a, b) => b[1] - a[1]),
          ),
        },
      ]),
  );

  return {
    totalInstances: counter.totalInstances,
    filesCount: counter.files.size,
    props,
  };
}

async function loadConfig(configPath) {
  const raw = await fs.readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

function createCollectorRule({
  targetComponent,
  trackedDeprecatedEntries,
  mmdsPackages,
  filePath,
  mmdsCounter,
  deprecatedCounter,
  overallCounter,
  deprecatedByLegacyComponent,
}) {
  return {
    create(context) {
      const sourceCode = context.sourceCode;
      const componentImports = new Map();
      const namespaceMMDSImports = new Set();

      function recordComponentUsage(importInfo, openingElement) {
        const counter = importInfo.source === 'mmds' ? mmdsCounter : deprecatedCounter;
        counter.totalInstances += 1;
        counter.files.add(filePath);
        overallCounter.totalInstances += 1;
        overallCounter.files.add(filePath);

        if (importInfo.source === 'deprecated' && importInfo.legacyComponent) {
          deprecatedByLegacyComponent[importInfo.legacyComponent] =
            (deprecatedByLegacyComponent[importInfo.legacyComponent] || 0) + 1;
        }

        for (const attribute of openingElement.attributes) {
          if (attribute.type === 'JSXSpreadAttribute') {
            const valueLabel = normalizeExpressionSnippet(sourceCode.getText(attribute.argument));
            trackProp(counter, '[spread]', valueLabel);
            trackProp(overallCounter, '[spread]', valueLabel);
            continue;
          }

          if (attribute.type !== 'JSXAttribute') {
            continue;
          }

          if (attribute.name.type !== 'JSXIdentifier') {
            continue;
          }

          const propName = attribute.name.name;
          const valueLabel = getPropValueLabel(attribute, sourceCode);
          trackProp(counter, propName, valueLabel);
          trackProp(overallCounter, propName, valueLabel);
        }
      }

      return {
        ImportDeclaration(node) {
          if (!node.source || typeof node.source.value !== 'string') {
            return;
          }

          const importPath = node.source.value;
          const importPathNormalized = normalizeImportPathForMatch(importPath);
          const deprecatedMatch = matchDeprecatedPath(importPath, trackedDeprecatedEntries);
          if (deprecatedMatch) {
            for (const specifier of node.specifiers) {
              if (specifier.type === 'ImportDefaultSpecifier') {
                componentImports.set(specifier.local.name, {
                  source: 'deprecated',
                  legacyComponent: deprecatedMatch.legacyComponent,
                });
                continue;
              }

              if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === deprecatedMatch.legacyComponent
              ) {
                componentImports.set(specifier.local.name, {
                  source: 'deprecated',
                  legacyComponent: deprecatedMatch.legacyComponent,
                });
              }
            }
            return;
          }

          // Handle component-library barrel imports:
          // import { ButtonIcon } from '../../component-library'
          if (importPathNormalized.includes('component-library')) {
            const trackedByLegacyName = new Map(
              trackedDeprecatedEntries.map((entry) => [entry.legacyComponent, entry]),
            );
            for (const specifier of node.specifiers) {
              if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported &&
                specifier.imported.type === 'Identifier'
              ) {
                const entry = trackedByLegacyName.get(specifier.imported.name);
                if (entry) {
                  componentImports.set(specifier.local.name, {
                    source: 'deprecated',
                    legacyComponent: entry.legacyComponent,
                  });
                }
              }
            }
          }

          const isMMDSImport = mmdsPackages.some(
            (pkg) => importPath === pkg || importPath.startsWith(`${pkg}/`),
          );
          if (!isMMDSImport) {
            return;
          }

          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier') {
              if (
                specifier.imported &&
                specifier.imported.type === 'Identifier' &&
                specifier.imported.name === targetComponent
              ) {
                componentImports.set(specifier.local.name, { source: 'mmds' });
              }
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
              namespaceMMDSImports.add(specifier.local.name);
            }
          }
        },

        JSXOpeningElement(node) {
          let importInfo = null;

          if (node.name.type === 'JSXIdentifier') {
            importInfo = componentImports.get(node.name.name) || null;
          } else if (node.name.type === 'JSXMemberExpression') {
            const object = node.name.object;
            const property = node.name.property;
            if (
              object.type === 'JSXIdentifier' &&
              property.type === 'JSXIdentifier' &&
              namespaceMMDSImports.has(object.name) &&
              property.name === targetComponent
            ) {
              importInfo = { source: 'mmds' };
            }
          }

          if (!importInfo) {
            return;
          }

          recordComponentUsage(importInfo, node);
        },
      };
    },
  };
}

async function auditProject(projectConfig, targetComponent) {
  const trackedDeprecatedEntries = Object.entries(
    projectConfig.deprecatedComponents || {},
  )
    .filter(([, config]) => {
      if (!config.replacement) {
        return false;
      }

      return (
        config.replacement.component === targetComponent &&
        typeof config.replacement.package === 'string' &&
        config.replacement.package.includes('@metamask/design-system')
      );
    })
    .map(([legacyComponent, config]) => ({
      legacyComponent,
      paths: config.paths || [],
    }));

  const mmdsCounter = createCounter();
  const deprecatedCounter = createCounter();
  const overallCounter = createCounter();
  const deprecatedByLegacyComponent = {};
  const mmdsPackages = projectConfig.currentPackages || [];

  const files = await collectProjectFiles(
    projectConfig.rootFolder,
    projectConfig.ignoreFolders || [],
  );

  for (const filePath of files) {
    const linter = new Linter({ configType: 'eslintrc' });
    linter.defineParser('component-props-ts-parser', tsEslintParser);
    linter.defineRule(
      'component-props-audit/collect',
      createCollectorRule({
        targetComponent,
        trackedDeprecatedEntries,
        mmdsPackages,
        filePath,
        mmdsCounter,
        deprecatedCounter,
        overallCounter,
        deprecatedByLegacyComponent,
      }),
    );

    const sourceText = await fs.readFile(path.resolve(process.cwd(), filePath), 'utf8');
    linter.verify(
      sourceText,
      {
        parser: 'component-props-ts-parser',
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        rules: {
          'component-props-audit/collect': 'error',
        },
      },
      { filename: filePath },
    );
  }

  return {
    filesScanned: files.length,
    targetComponent,
    mmds: counterToJson(mmdsCounter),
    deprecated: counterToJson(deprecatedCounter),
    overall: counterToJson(overallCounter),
    deprecatedByLegacyComponent: Object.fromEntries(
      Object.entries(deprecatedByLegacyComponent).sort((a, b) => b[1] - a[1]),
    ),
  };
}

async function main() {
  const parsed = parseArgs(process.argv);
  const config = await loadConfig(parsed.config);

  const projectNames = parsed.projects
    ? parsed.projects.split(',').map((v) => v.trim()).filter(Boolean)
    : Object.keys(config.projects || {});

  const missingProjects = projectNames.filter((name) => !config.projects[name]);
  if (missingProjects.length > 0) {
    throw new Error(`Unknown project(s): ${missingProjects.join(', ')}`);
  }

  const targetComponents = parsed.components
    ? parsed.components.split(',').map((v) => v.trim()).filter(Boolean)
    : [parsed.component];

  const metricsDir = path.join(__dirname, '..', 'metrics');
  await fs.mkdir(metricsDir, { recursive: true });

  const indexEntries = [];

  for (const targetComponent of targetComponents) {
    const projects = {};
    for (const projectName of projectNames) {
      projects[projectName] = await auditProject(
        config.projects[projectName],
        targetComponent,
      );
    }

    const output = {
      component: targetComponent,
      generatedAt: new Date().toISOString(),
      projects,
    };

    const defaultOutputPath = path.join(
      metricsDir,
      `${targetComponent.toLowerCase()}-props-audit-${parsed.date}.json`,
    );
    const outputPath = parsed.output && targetComponents.length === 1
      ? parsed.output
      : defaultOutputPath;
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

    const latestPath = path.join(
      path.dirname(outputPath),
      `${targetComponent.toLowerCase()}-props-audit-latest.json`,
    );
    await fs.writeFile(latestPath, `${JSON.stringify(output, null, 2)}\n`);

    indexEntries.push({
      component: targetComponent,
      file: path.basename(latestPath),
      projects: Object.keys(projects),
      generatedAt: output.generatedAt,
    });

    console.log(`✓ Component props audit written to ${outputPath}`);
    console.log(`✓ Component props audit latest written to ${latestPath}`);
    console.log(`  Component: ${targetComponent}`);
    for (const [projectName, result] of Object.entries(projects)) {
      console.log(
        `  [${projectName}] MMDS instances: ${result.mmds.totalInstances}, deprecated instances: ${result.deprecated.totalInstances}, files scanned: ${result.filesScanned}`,
      );
    }
  }

  const indexPath = path.join(metricsDir, 'component-props-audit-index.json');
  let existingIndexEntries = [];
  try {
    const existingIndexRaw = await fs.readFile(indexPath, 'utf8');
    const existingIndex = JSON.parse(existingIndexRaw);
    if (Array.isArray(existingIndex.components)) {
      existingIndexEntries = existingIndex.components;
    }
  } catch (_) {
    // No existing index yet.
  }

  const mergedEntries = new Map();
  for (const entry of existingIndexEntries) {
    if (entry && typeof entry.component === 'string') {
      mergedEntries.set(entry.component, entry);
    }
  }
  for (const entry of indexEntries) {
    mergedEntries.set(entry.component, entry);
  }

  const indexOutput = {
    generatedAt: new Date().toISOString(),
    components: Array.from(mergedEntries.values()).sort((a, b) =>
      a.component.localeCompare(b.component),
    ),
  };
  await fs.writeFile(indexPath, `${JSON.stringify(indexOutput, null, 2)}\n`);
  console.log(`✓ Component props audit index written to ${indexPath}`);

  if (targetComponents.length > 1) {
    console.log(`  Components audited: ${targetComponents.length}`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
