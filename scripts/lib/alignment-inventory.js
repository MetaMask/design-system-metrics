/**
 * Build the MMDS platform alignment inventory from package component folders
 * and Code Connect files, plus a small exception-families config.
 */

const fs = require('fs');
const path = require('path');

const SKIP_COMPONENT_DIRS = new Set(['temp-components']);

/**
 * @param {string} componentsRoot
 * @returns {string[]}
 */
function listComponentDirs(componentsRoot) {
  if (!fs.existsSync(componentsRoot)) return [];
  return fs
    .readdirSync(componentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SKIP_COMPONENT_DIRS.has(entry.name) && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

const FIGMA_CONNECT_URL_RE =
  /figma\.connect\([\s\S]*?['"](https:\/\/(?:www\.)?figma\.com\/(?:design|file|board)\/[^'"]+)['"]/;

/**
 * @param {string} fileContents
 * @returns {string | null}
 */
function extractFigmaUrl(fileContents) {
  const match = fileContents.match(FIGMA_CONNECT_URL_RE);
  return match ? match[1] : null;
}

/**
 * Normalize Code Connect input to a name → Figma URL (or null) map.
 * Accepts a Map, an array of names, or a plain object.
 * @param {Iterable<string> | Record<string, string | null> | Map<string, string | null> | undefined} input
 * @returns {Map<string, string | null>}
 */
function toConnectMap(input) {
  if (!input) return new Map();
  if (input instanceof Map) return input;
  if (Array.isArray(input) || typeof input[Symbol.iterator] === 'function') {
    return new Map([...input].map((name) => [name, null]));
  }
  return new Map(Object.entries(input));
}

/**
 * @param {string} packageSrcRoot  e.g. packages/design-system-react/src
 * @returns {Map<string, string | null>} component folder name → Figma URL from Code Connect
 */
function listCodeConnectComponents(packageSrcRoot) {
  const found = new Map();
  const componentsRoot = path.join(packageSrcRoot, 'components');
  if (!fs.existsSync(componentsRoot)) return found;

  for (const name of listComponentDirs(componentsRoot)) {
    const dir = path.join(componentsRoot, name);
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.figma.tsx'));
    if (files.length === 0) continue;
    let url = null;
    for (const file of files) {
      const contents = fs.readFileSync(path.join(dir, file), 'utf8');
      url = extractFigmaUrl(contents);
      if (url) break;
    }
    found.set(name, url);
  }
  return found;
}

/**
 * @param {object} exceptions
 * @returns {{ byName: Map<string, { kind: string, familyId?: string }>, familyIds: Map<string, object> }}
 */
function buildExceptionIndex(exceptions) {
  const byName = new Map();
  const familyById = new Map();

  for (const name of exceptions.excludeFromInventory || []) {
    byName.set(name, { kind: 'excluded' });
  }
  for (const name of exceptions.helpers || []) {
    if (!byName.has(name)) byName.set(name, { kind: 'helper_excluded' });
  }
  for (const family of exceptions.families || []) {
    familyById.set(family.id, family);
    for (const name of [...(family.react || []), ...(family.reactNative || [])]) {
      if (!byName.has(name)) {
        byName.set(name, { kind: 'platform_exception', familyId: family.id });
      }
    }
  }
  return { byName, familyById };
}

/**
 * @param {string} name
 * @param {Map<string, { kind: string, familyId?: string }>} byName
 */
function classifyName(name, byName) {
  return byName.get(name) || { kind: 'required_shared' };
}

function presentCount(members, presentSet) {
  return members.filter((name) => presentSet.has(name)).length;
}

function familyIsAligned(family, reactSet, rnSet) {
  const reactMembers = family.react || [];
  const rnMembers = family.reactNative || [];
  const reactOk = reactMembers.length === 0 || reactMembers.every((name) => reactSet.has(name));
  const rnOk = rnMembers.length === 0 || rnMembers.every((name) => rnSet.has(name));
  return reactOk && rnOk;
}

/**
 * @param {{
 *   react: string[],
 *   reactNative: string[],
 *   reactConnect: Iterable<string>,
 *   reactNativeConnect: Iterable<string>,
 *   exceptions: object,
 *   date: string,
 *   generatedAt?: string,
 * }} input
 */
function buildAlignmentReport(input) {
  const reactSet = new Set(input.react);
  const rnSet = new Set(input.reactNative);
  const reactConnect = toConnectMap(input.reactConnect);
  const rnConnect = toConnectMap(input.reactNativeConnect);
  const { byName } = buildExceptionIndex(input.exceptions);

  const names = [...new Set([...input.react, ...input.reactNative])]
    .filter((name) => classifyName(name, byName).kind !== 'excluded')
    .sort();

  const components = names.map((name) => {
    const meta = classifyName(name, byName);
    const inReact = reactSet.has(name);
    const inRn = rnSet.has(name);
    const connectReact = inReact && reactConnect.has(name);
    const connectRn = inRn && rnConnect.has(name);
    const figmaUrl = (connectReact ? reactConnect.get(name) : null) || (connectRn ? rnConnect.get(name) : null) || null;
    const figma = connectReact || connectRn ? 'linked' : 'unknown';
    const missingOn = [];
    if (meta.kind === 'required_shared') {
      if (!inReact) missingOn.push('react');
      if (!inRn) missingOn.push('reactNative');
    }
    return {
      name,
      classification: meta.kind,
      familyId: meta.familyId || null,
      figma,
      figmaUrl,
      react: inReact,
      reactNative: inRn,
      codeConnectReact: Boolean(connectReact),
      codeConnectReactNative: Boolean(connectRn),
      missingOn,
    };
  });

  const families = (input.exceptions.families || []).map((family) => {
    const reactMembers = family.react || [];
    const rnMembers = family.reactNative || [];
    return {
      id: family.id,
      label: family.label,
      rationale: family.rationale,
      react: reactMembers,
      reactNative: rnMembers,
      reactPresent: presentCount(reactMembers, reactSet),
      reactNativePresent: presentCount(rnMembers, rnSet),
      aligned: familyIsAligned(family, reactSet, rnSet),
    };
  });

  const required = components.filter((c) => c.classification === 'required_shared');
  const missingOnReact = required.filter((c) => c.missingOn.includes('react'));
  const missingOnRn = required.filter((c) => c.missingOn.includes('reactNative'));
  const openGapItems = required.filter((c) => c.missingOn.length > 0);
  const covered = required.filter((c) => c.missingOn.length === 0);
  const requiredCoverage = required.length === 0 ? 100 : (covered.length / required.length) * 100;

  const connectEligible = components.filter(
    (c) => c.classification !== 'helper_excluded' && (c.react || c.reactNative),
  );
  let connectHave = 0;
  let connectSlots = 0;
  for (const c of connectEligible) {
    if (c.react) {
      connectSlots += 1;
      if (c.codeConnectReact) connectHave += 1;
    }
    if (c.reactNative) {
      connectSlots += 1;
      if (c.codeConnectReactNative) connectHave += 1;
    }
  }
  const codeConnectCoverage = connectSlots === 0 ? 100 : (connectHave / connectSlots) * 100;

  const codeConnectGapItems = components
    .filter(
      (c) =>
        (c.react && !c.codeConnectReact) || (c.reactNative && !c.codeConnectReactNative),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const missingCodeConnectReact = components.filter(
    (c) => c.react && !c.codeConnectReact,
  ).length;
  const missingCodeConnectReactNative = components.filter(
    (c) => c.reactNative && !c.codeConnectReactNative,
  ).length;

  const queue = [...openGapItems].sort((a, b) => {
    const aReact = a.missingOn.includes('react') ? 0 : 1;
    const bReact = b.missingOn.includes('react') ? 0 : 1;
    if (aReact !== bReact) return aReact - bReact;
    return a.name.localeCompare(b.name);
  });

  const round1 = (n) => Math.round(n * 10) / 10;
  const figmaLinked = components.filter((c) => c.figma === 'linked').length;

  return {
    date: input.date,
    generatedAt: input.generatedAt || new Date().toISOString(),
    source: 'metamask-design-system component folders + Code Connect files',
    figmaStatus: 'code-connect',
    summary: {
      inventoryCount: components.length,
      requiredSharedCount: required.length,
      platformExceptionCount: components.filter((c) => c.classification === 'platform_exception').length,
      helperExcludedCount: components.filter((c) => c.classification === 'helper_excluded').length,
      requiredCoverage: round1(requiredCoverage),
      openGaps: openGapItems.length,
      missingOnReact: missingOnReact.length,
      missingOnReactNative: missingOnRn.length,
      figmaLinked,
      codeConnectCoverage: round1(codeConnectCoverage),
      codeConnectMapped: connectHave,
      codeConnectSlots: connectSlots,
      codeConnectGaps: codeConnectGapItems.length,
      missingCodeConnectReact,
      missingCodeConnectReactNative,
      familiesAligned: families.filter((f) => f.aligned).length,
      familiesTotal: families.length,
    },
    families,
    codeConnectQueue: codeConnectGapItems.map((c) => ({
      name: c.name,
      missingConnect: [
        ...(c.react && !c.codeConnectReact ? ['react'] : []),
        ...(c.reactNative && !c.codeConnectReactNative ? ['reactNative'] : []),
      ],
      react: c.react,
      reactNative: c.reactNative,
    })),
    queue: queue.map((c) => ({
      name: c.name,
      missingOn: c.missingOn,
      react: c.react,
      reactNative: c.reactNative,
    })),
    components,
  };
}

function scanMmdsPackages(dsRoot) {
  const reactRoot = path.join(dsRoot, 'packages/design-system-react/src');
  const rnRoot = path.join(dsRoot, 'packages/design-system-react-native/src');
  return {
    react: listComponentDirs(path.join(reactRoot, 'components')),
    reactNative: listComponentDirs(path.join(rnRoot, 'components')),
    reactConnect: listCodeConnectComponents(reactRoot),
    reactNativeConnect: listCodeConnectComponents(rnRoot),
  };
}

module.exports = {
  SKIP_COMPONENT_DIRS,
  listComponentDirs,
  listCodeConnectComponents,
  extractFigmaUrl,
  toConnectMap,
  buildExceptionIndex,
  classifyName,
  buildAlignmentReport,
  scanMmdsPackages,
  familyIsAligned,
};
