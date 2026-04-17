/**
 * Typed sync-config stage.
 *
 * Rebuilds config.json from:
 * - static project settings in config.static.json
 * - @deprecated annotations in legacy component folders
 * - current MMDS exports from the design system repo
 *
 * Existing config.json is used only for preserving explicit manual overrides
 * and for diff/reporting during the transition.
 */

import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import * as babelParser from '@babel/parser';
import { glob } from 'glob';

import type {
  Config,
  DeprecatedComponentConfig,
  DeprecatedComponentReplacement,
  Project,
  ProjectConfig,
} from './types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REPOS_DIR = path.join(ROOT, 'repos');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATIC_CONFIG_PATH = path.join(ROOT, 'config.static.json');

const REPO_PATHS = {
  extension: path.join(REPOS_DIR, 'metamask-extension'),
  mobile: path.join(REPOS_DIR, 'metamask-mobile'),
  mmds: path.join(REPOS_DIR, 'metamask-design-system'),
} as const;

type ProjectStaticConfig = Omit<ProjectConfig, 'currentComponents' | 'deprecatedComponents'> & {
  legacyComponentFolder: string;
};

type StaticConfig = {
  projects: Record<Project, ProjectStaticConfig>;
};

type DeprecatedScanResult = {
  name: string;
  relativePath: string;
  deprecationMessage: string;
};

type ReplacementCandidate = DeprecatedComponentReplacement;

type SyncOptions = {
  dryRun: boolean;
  skipUpdate: boolean;
  check: boolean;
};

type DiffSummary = {
  added: string[];
  removed: string[];
  changed: string[];
  projectSummaries: string[];
};

const MMDS_PACKAGE_BY_PROJECT: Record<Project, string> = {
  extension: '@metamask/design-system-react',
  mobile: '@metamask/design-system-react-native',
};

const MMDS_EXPORT_PATHS = {
  extension: 'packages/design-system-react/src/components/index.ts',
  mobile: 'packages/design-system-react-native/src/components/index.ts',
} as const;

const COMPONENT_EXCLUDE_PATTERNS = [
  /^[A-Z0-9_]+$/,
  /Type$/,
  /Types$/,
  /Enum$/,
  /Context$/,
  /Provider$/,
  /^use[A-Z]/,
  /^get[A-Z]/,
  /^set[A-Z]/,
  /^is[A-Z]/,
  /^has[A-Z]/,
  /^should[A-Z]/,
  /^fetch[A-Z]/,
  /^calculate[A-Z]/,
  /^format[A-Z]/,
  /^parse[A-Z]/,
  /^transform[A-Z]/,
  /^map[A-Z]/,
  /^filter[A-Z]/,
  /^build[A-Z]/,
  /^extract[A-Z]/,
  /^combine[A-Z]/,
  /^merge[A-Z]/,
  /^group[A-Z]/,
  /^sort[A-Z]/,
  /^aggregate[A-Z]/,
  /^select[A-Z]/,
  /^handle[A-Z]/,
  /^render[A-Z]/,
  /^determine[A-Z]/,
  /^compare[A-Z]/,
  /^strip[A-Z]/,
  /^open[A-Z]/,
];

function getFlag(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseOptions(): SyncOptions {
  return {
    dryRun: hasFlag('--dry-run'),
    skipUpdate: hasFlag('--skip-update'),
    check: hasFlag('--check'),
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

async function updateSubmodules(): Promise<void> {
  console.log('📦 Updating git submodules...\n');

  const result = spawnSync('git', ['submodule', 'update', '--remote', '--merge'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`git submodule update failed with exit ${result.status ?? 'unknown'}`);
  }

  console.log('✅ Submodules updated\n');
}

function getRelativePath(filePath: string, project: Project): string {
  const prefix = project === 'extension' ? 'ui/' : 'app/';
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.indexOf(prefix);
  return idx === -1 ? normalized : normalized.slice(idx);
}

function isLikelyComponent(name: string, filePath: string): boolean {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    return false;
  }

  if (
    filePath.includes('/helpers/') ||
    filePath.includes('/hooks/') ||
    filePath.includes('/constants/') ||
    filePath.includes('/utils/')
  ) {
    return false;
  }

  return !COMPONENT_EXCLUDE_PATTERNS.some((pattern) => pattern.test(name));
}

function extractDeprecationHints(ast: any): Record<string, string> {
  const hints: Record<string, string> = {};
  const comments = Array.isArray(ast.comments) ? ast.comments : [];

  for (const comment of comments) {
    if (comment.type !== 'CommentBlock' || !comment.value.includes('@deprecated')) {
      continue;
    }

    const componentName = findComponentNameAfterComment(ast, comment.end);
    if (componentName) {
      hints[componentName] = comment.value;
    }
  }

  return hints;
}

function findComponentNameAfterComment(ast: any, commentEnd: number): string | null {
  for (const node of ast.program.body) {
    if (node.start <= commentEnd) {
      continue;
    }

    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.type === 'VariableDeclaration') {
        return node.declaration.declarations[0]?.id?.name ?? null;
      }
      if (node.declaration?.type === 'FunctionDeclaration') {
        return node.declaration.id?.name ?? null;
      }
    }

    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration?.type === 'Identifier') {
        return node.declaration.name ?? null;
      }
      if (node.declaration?.type === 'FunctionDeclaration') {
        return node.declaration.id?.name ?? null;
      }
    }

    if (node.type === 'VariableDeclaration') {
      return node.declarations[0]?.id?.name ?? null;
    }

    if (node.type === 'FunctionDeclaration') {
      return node.id?.name ?? null;
    }
  }

  return null;
}

function extractExportedComponentNames(ast: any, filePath: string): string[] {
  const exported = new Set<string>();

  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.type === 'VariableDeclaration') {
        for (const declaration of node.declaration.declarations) {
          const name = declaration.id?.name;
          if (name && isLikelyComponent(name, filePath)) {
            exported.add(name);
          }
        }
      }

      if (node.declaration?.type === 'FunctionDeclaration') {
        const name = node.declaration.id?.name;
        if (name && isLikelyComponent(name, filePath)) {
          exported.add(name);
        }
      }
    }

    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration?.type === 'Identifier') {
        const name = node.declaration.name;
        if (name && isLikelyComponent(name, filePath)) {
          exported.add(name);
        }
      }

      if (node.declaration?.type === 'FunctionDeclaration') {
        const name = node.declaration.id?.name;
        if (name && isLikelyComponent(name, filePath)) {
          exported.add(name);
        }
      }
    }
  }

  return [...exported];
}

async function scanFileForDeprecated(filePath: string, project: Project): Promise<DeprecatedScanResult[]> {
  const content = await fs.readFile(filePath, 'utf8');
  let ast: any;

  try {
    ast = babelParser.parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      attachComment: true,
      errorRecovery: true,
    });
  } catch {
    return [];
  }

  const deprecationHints = extractDeprecationHints(ast);
  const exportedNames = extractExportedComponentNames(ast, filePath);

  return exportedNames
    .filter((name) => Boolean(deprecationHints[name]))
    .map((name) => ({
      name,
      relativePath: getRelativePath(filePath, project),
      deprecationMessage: deprecationHints[name],
    }));
}

async function scanProjectForDeprecated(project: Project, config: ProjectStaticConfig): Promise<DeprecatedScanResult[]> {
  const pattern = path.join(config.legacyComponentFolder, '**/*.{js,jsx,tsx}');
  const filePaths = await glob(pattern, {
    cwd: ROOT,
    absolute: true,
    ignore: ['**/*.test.*', '**/*.stories.*', '**/index.*'],
  });

  const results = await Promise.all(
    filePaths.map((filePath: string) => scanFileForDeprecated(filePath, project)),
  );
  return results.flat();
}

function parseMmdsExports(content: string): string[] {
  const components = new Set<string>();
  const exportRegex = /export\s+\{\s*([^}]+)\s*\}\s+from\s+['"]\.\/([^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = exportRegex.exec(content)) !== null) {
    const exportNames = match[1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && !name.startsWith('type '));
    const baseName = match[2].split('/').pop();
    const componentName = exportNames
      .map((name) => name.match(/^default\s+as\s+([A-Z][A-Za-z0-9]+)/)?.[1] ?? name)
      .find((name) => name === baseName);
    if (componentName) {
      components.add(componentName);
    }
  }

  return [...components].sort();
}

async function loadCurrentComponents(project: Project): Promise<string[]> {
  const exportFile = path.join(REPO_PATHS.mmds, MMDS_EXPORT_PATHS[project]);
  return parseMmdsExports(await fs.readFile(exportFile, 'utf8'));
}

function normalizeReplacementCandidate(component: string, pkg: string): ReplacementCandidate {
  return {
    component,
    package: pkg,
    ...(pkg.startsWith('@metamask/design-system') ? {} : { path: pkg }),
  };
}

function parseReplacementCandidates(message: string): ReplacementCandidate[] {
  const candidates: ReplacementCandidate[] = [];
  const packageRegex = /from\s+`?([@./A-Za-z0-9_-]+(?:\/[@./A-Za-z0-9._-]+)*)`?/gi;

  let match: RegExpExecArray | null;
  while ((match = packageRegex.exec(message)) !== null) {
    const pkg = match[1];
    const windowStart = Math.max(0, match.index - 200);
    const prefix = message.slice(windowStart, match.index);

    const quotedNames = [...prefix.matchAll(/`([A-Z][A-Za-z0-9]+)`/g)].map(([, name]) => name);
    const names = quotedNames.length
      ? quotedNames
      : [
          prefix.match(/(?:use|update your code to use|please use)\s+([A-Z][A-Za-z0-9]+)(?:\s+component)?\s*$/i)?.[1],
        ].filter((name): name is string => Boolean(name));

    for (const name of names) {
      const candidate = normalizeReplacementCandidate(name, pkg);
      if (!candidates.some((existing) => existing.component === candidate.component && existing.package === candidate.package)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function selectPrimaryReplacement(
  candidates: ReplacementCandidate[],
  project: Project,
  currentComponents: Set<string>,
): ReplacementCandidate | null {
  const preferredPackage = MMDS_PACKAGE_BY_PROJECT[project];
  const validMmdsCandidate = candidates.find(
    (candidate) =>
      candidate.package === preferredPackage &&
      currentComponents.has(candidate.component),
  );

  if (validMmdsCandidate) {
    return { component: validMmdsCandidate.component, package: validMmdsCandidate.package };
  }

  return candidates[0] ?? null;
}

function createDeprecatedComponentConfig(
  project: Project,
  scanResults: DeprecatedScanResult[],
  currentComponents: string[],
): {
  deprecatedComponents: Record<string, DeprecatedComponentConfig>;
  warnings: string[];
} {
  const currentComponentSet = new Set(currentComponents);
  const deprecatedComponents: Record<string, DeprecatedComponentConfig> = {};
  const warnings: string[] = [];

  for (const result of scanResults) {
    const candidates = parseReplacementCandidates(result.deprecationMessage);
    const primaryReplacement = selectPrimaryReplacement(candidates, project, currentComponentSet);

    const existing = deprecatedComponents[result.name];
    const mergedPaths = existing ? new Set(existing.paths) : new Set<string>();
    mergedPaths.add(result.relativePath);

    deprecatedComponents[result.name] = {
      paths: [...mergedPaths].sort(),
      replacement: primaryReplacement,
      replacements: candidates.length ? candidates : undefined,
      _deprecationMessage: result.deprecationMessage,
      _autoGenerated: true,
    };

    for (const candidate of candidates) {
      if (
        candidate.package === MMDS_PACKAGE_BY_PROJECT[project] &&
        !currentComponentSet.has(candidate.component)
      ) {
        warnings.push(
          `[${project}] ${result.name}: deprecated tag references missing MMDS component ${candidate.component} from ${candidate.package}`,
        );
      }
    }
  }

  return { deprecatedComponents, warnings };
}

function preserveManualOverrides(
  generated: Record<string, DeprecatedComponentConfig>,
  existing: Record<string, DeprecatedComponentConfig> = {},
): Record<string, DeprecatedComponentConfig> {
  const merged = { ...generated };

  for (const [componentName, componentConfig] of Object.entries(existing)) {
    if (componentConfig._autoGenerated === false) {
      merged[componentName] = componentConfig;
    }
  }

  return Object.fromEntries(
    Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function buildConfig(
  staticConfig: StaticConfig,
  existingConfig: Config | null,
  discovered: Record<Project, { deprecatedComponents: Record<string, DeprecatedComponentConfig>; currentComponents: string[] }>,
): Config {
  const config: Config = {
    projects: {
      extension: {} as ProjectConfig,
      mobile: {} as ProjectConfig,
    },
  };

  for (const project of ['extension', 'mobile'] as Project[]) {
    const staticProject = staticConfig.projects[project];
    const existingProject = existingConfig?.projects?.[project];
    config.projects[project] = {
      rootFolder: staticProject.rootFolder,
      legacyComponentFolder: staticProject.legacyComponentFolder,
      ignoreFolders: staticProject.ignoreFolders,
      filePattern: staticProject.filePattern,
      outputFile: staticProject.outputFile,
      currentPackages: staticProject.currentPackages,
      currentComponents: discovered[project].currentComponents,
      deprecatedComponents: preserveManualOverrides(
        discovered[project].deprecatedComponents,
        existingProject?.deprecatedComponents,
      ),
      ...(staticProject.codeOwnerMetricIgnoreGlobs
        ? { codeOwnerMetricIgnoreGlobs: staticProject.codeOwnerMetricIgnoreGlobs }
        : {}),
    };
  }

  return config;
}

function diffConfigs(previousConfig: Config | null, nextConfig: Config): DiffSummary {
  if (!previousConfig) {
    return {
      added: ['config.json'],
      removed: [],
      changed: [],
      projectSummaries: ['config.json will be created'],
    };
  }

  const summary: DiffSummary = {
    added: [],
    removed: [],
    changed: [],
    projectSummaries: [],
  };

  for (const project of ['extension', 'mobile'] as Project[]) {
    const previousProject = previousConfig.projects?.[project];
    const nextProject = nextConfig.projects[project];

    const previousDeprecated = previousProject?.deprecatedComponents ?? {};
    const nextDeprecated = nextProject.deprecatedComponents;

    const previousKeys = new Set(Object.keys(previousDeprecated));
    const nextKeys = new Set(Object.keys(nextDeprecated));

    const addedCount = [...nextKeys].filter((key) => !previousKeys.has(key)).length;
    const removedCount = [...previousKeys].filter((key) => !nextKeys.has(key)).length;
    const changedCount = [...nextKeys].filter((key) => {
      if (!previousKeys.has(key)) {
        return false;
      }
      return JSON.stringify(previousDeprecated[key]) !== JSON.stringify(nextDeprecated[key]);
    }).length;

    const currentComponentsChanged =
      JSON.stringify(previousProject?.currentComponents ?? []) !== JSON.stringify(nextProject.currentComponents);

    if (addedCount || removedCount || changedCount || currentComponentsChanged) {
      summary.changed.push(project);
    }

    summary.projectSummaries.push(
      `${project}: ${addedCount} added, ${removedCount} removed, ${changedCount} changed deprecated mappings${
        currentComponentsChanged ? ', MMDS export list changed' : ''
      }`,
    );
  }

  return summary;
}

function printDiffSummary(diff: DiffSummary): void {
  console.log('📊 Diff against current config.json:\n');
  for (const line of diff.projectSummaries) {
    console.log(`  - ${line}`);
  }
  console.log();
}

async function writeConfig(config: Config): Promise<void> {
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseOptions();
  console.log('🚀 Starting config.json sync...\n');

  if (!options.skipUpdate) {
    await updateSubmodules();
  } else {
    console.log('⏭️  Skipping submodule update\n');
  }

  const staticConfig = await readJson<StaticConfig>(STATIC_CONFIG_PATH);
  const existingConfig = await fs
    .access(CONFIG_PATH)
    .then(() => readJson<Config>(CONFIG_PATH))
    .catch(() => null);

  const warnings: string[] = [];
  const discovered = {} as Record<Project, { deprecatedComponents: Record<string, DeprecatedComponentConfig>; currentComponents: string[] }>;

  for (const project of ['extension', 'mobile'] as Project[]) {
    console.log(`🔍 Scanning ${project} deprecated components...\n`);

    const currentComponents = await loadCurrentComponents(project);
    const scanResults = await scanProjectForDeprecated(project, staticConfig.projects[project]);
    const generated = createDeprecatedComponentConfig(project, scanResults, currentComponents);

    warnings.push(...generated.warnings);
    discovered[project] = {
      deprecatedComponents: generated.deprecatedComponents,
      currentComponents,
    };

    console.log(`  Found ${scanResults.length} deprecated component export(s) in ${project}`);
    console.log(`  Found ${currentComponents.length} MMDS export(s) for ${project}\n`);
  }

  const nextConfig = buildConfig(staticConfig, existingConfig, discovered);
  const diff = diffConfigs(existingConfig, nextConfig);
  printDiffSummary(diff);

  if (warnings.length) {
    console.log('⚠️  Warnings:\n');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
    console.log();
  }

  if (options.check && diff.changed.length > 0) {
    console.error('❌ --check failed: generated config differs from current config.json');
    process.exit(1);
  }

  if (options.dryRun) {
    console.log('🔍 DRY RUN - No changes written to config.json\n');
    return;
  }

  await writeConfig(nextConfig);
  console.log('✅ Config written to config.json\n');
}

main().catch((error) => {
  console.error(`❌ Sync failed: ${(error as Error).message}`);
  process.exit(1);
});
