/**
 * Intelligent component mapper
 *
 * Maps deprecated components to their MMDS replacements using:
 * 1. Manual mapping table (special cases)
 * 2. Explicit hints from @deprecated messages
 * 3. Multi-replacement lists in deprecation prose
 * 4. Exact name matching
 * 5. Returns null if no replacement exists
 */

// Manual mappings for special cases where names don't match 1:1
const MANUAL_MAPPINGS = {
  extension: {
    // Button variants → single Button component
    ButtonPrimary: { component: 'Button', package: '@metamask/design-system-react' },
    ButtonSecondary: { component: 'Button', package: '@metamask/design-system-react' },
    ButtonLink: {
      component: 'TextButton',
      package: '@metamask/design-system-react',
      alternatives: ['Button'],
      replacementOptions: ['TextButton', 'Button'],
    },

    // Icon library components → Icon
    FeatherIcon: { component: 'Icon', package: '@metamask/design-system-react' },
    FontAwesomeIcon: { component: 'Icon', package: '@metamask/design-system-react' },
    IonicIcon: { component: 'Icon', package: '@metamask/design-system-react' },
    SimpleLineIconsIcon: { component: 'Icon', package: '@metamask/design-system-react' },

    // Special renames
    SiteOrigin: { component: 'AvatarFavicon', package: '@metamask/design-system-react' },
  },

  mobile: {
    // Badge variants
    BadgeNotifications: { component: 'BadgeCount', package: '@metamask/design-system-react-native' },

    ButtonLink: {
      component: 'TextButton',
      package: '@metamask/design-system-react-native',
      alternatives: ['Button'],
      replacementOptions: ['TextButton', 'Button'],
    },

    // Sheet components → BottomSheet (intermediate migration to component-library)
    SheetBottom: {
      component: 'BottomSheet',
      package: 'component-library',
      path: 'app/component-library/components/BottomSheets/BottomSheet',
    },
    SheetHeader: {
      component: 'BottomSheetHeader',
      package: 'component-library',
      path: 'app/component-library/components/BottomSheets/BottomSheetHeader',
    },
  },
};

function getMmdsPackage(project) {
  return project === 'extension'
    ? '@metamask/design-system-react'
    : '@metamask/design-system-react-native';
}

function getMmdsList(project, mmdsComponents) {
  return project === 'extension'
    ? mmdsComponents.react
    : mmdsComponents.reactNative;
}

function isMmdsPackage(packageName) {
  return Boolean(packageName && packageName.includes('@metamask/design-system'));
}

function buildReplacementFromNames(names, mmdsList, mmdsPackage) {
  const valid = [...new Set(names)].filter((name) => mmdsList.includes(name));
  if (valid.length === 0) return null;

  return {
    component: valid[0],
    package: mmdsPackage,
    alternatives: valid.slice(1),
    replacementOptions: valid,
  };
}

function upgradeToMmdsIfAvailable(replacement, mmdsList, mmdsPackage) {
  if (!replacement) return null;

  const options = getReplacementOptions(replacement);
  const validOptions = options.filter((name) => mmdsList.includes(name));
  if (validOptions.length === 0) return replacement;

  return {
    ...replacement,
    component: validOptions[0],
    package: mmdsPackage,
    alternatives: validOptions.slice(1),
    replacementOptions: validOptions,
    path: undefined,
  };
}

function finalizeReplacement(replacement, mmdsList, mmdsPackage) {
  if (!replacement) return null;

  const upgraded = upgradeToMmdsIfAvailable(replacement, mmdsList, mmdsPackage);
  if (isMmdsPackage(upgraded.package)) {
    return upgraded;
  }

  return upgraded;
}

/**
 * Map a deprecated component to its MMDS replacement
 */
function mapComponent(component, mmdsComponents) {
  const { name, deprecationMessage, project } = component;
  const mmdsPackage = getMmdsPackage(project);
  const mmdsList = getMmdsList(project, mmdsComponents);

  const manualMapping = MANUAL_MAPPINGS[project]?.[name];
  if (manualMapping) {
    return finalizeReplacement(manualMapping, mmdsList, mmdsPackage);
  }

  const hintMapping = parseDeprecationHint(deprecationMessage, project, mmdsList, mmdsPackage);
  if (hintMapping) {
    return finalizeReplacement(hintMapping, mmdsList, mmdsPackage);
  }

  const multiMapping = parseMultiReplacementHint(
    deprecationMessage,
    mmdsList,
    mmdsPackage,
  );
  if (multiMapping) {
    return finalizeReplacement(multiMapping, mmdsList, mmdsPackage);
  }

  if (mmdsList.includes(name)) {
    return {
      component: name,
      package: mmdsPackage,
    };
  }

  return null;
}

/**
 * Parse @deprecated message for explicit replacement hints
 */
function parseDeprecationHint(message, project, mmdsList, mmdsPackage) {
  if (!message) return null;

  const mmdsPattern = /use\s+`?(\w+)`?\s+from\s+`?(@metamask\/design-system[^`\s]+)`?/i;
  const match = message.match(mmdsPattern);

  if (match) {
    return {
      component: match[1],
      package: match[2],
    };
  }

  const genericUsePattern =
    /(?:please update your code to )?use\s+`?(\w+)`?\s+from\s+`?([^`]+)`?/i;
  const genericMatch = message.match(genericUsePattern);

  if (genericMatch) {
    const componentName = genericMatch[1];
    const sourcePath = genericMatch[2];

    if (sourcePath.includes('@metamask/design-system')) {
      const packageMatch = sourcePath.match(/@metamask\/design-system[-\w]*/);
      return {
        component: componentName,
        package: packageMatch ? packageMatch[0] : mmdsPackage,
      };
    }

    if (mmdsList.includes(componentName)) {
      return {
        component: componentName,
        package: mmdsPackage,
      };
    }
  }

  const componentLibPattern = /component-library\/([^/\s]+)/i;
  const libMatch = message.match(componentLibPattern);

  if (libMatch) {
    const componentName = toPascalCase(libMatch[1]);
    return {
      component: componentName,
      package: 'component-library',
      path: project === 'extension'
        ? `ui/components/component-library/${libMatch[1]}`
        : `app/component-library/components/${componentName}`,
    };
  }

  return null;
}

/**
 * Parse multi-replacement prose such as Avatar variants or ButtonLink guidance.
 */
function parseMultiReplacementHint(message, mmdsList, mmdsPackage) {
  if (!message) return null;

  const packageMatch = message.match(/@metamask\/design-system[-\w]*/);
  const packageName = packageMatch ? packageMatch[0] : mmdsPackage;

  const quotedNames = [...message.matchAll(/`([A-Z][A-Za-z0-9]*)`/g)].map((m) => m[1]);
  const fromQuotes = buildReplacementFromNames(quotedNames, mmdsList, packageName);
  if (fromQuotes) return fromQuotes;

  const useNameMatches = [...message.matchAll(/(?:^|\s)-?\s*Use\s+`?(\w+)`?/gi)];
  for (const patternMatch of useNameMatches) {
    const mapping = buildReplacementFromNames([patternMatch[1]], mmdsList, packageName);
    if (mapping) return mapping;
  }

  const suchAsMatch = message.match(/such as\s+([^.`\n]+)/i);
  if (suchAsMatch) {
    const segmentNames = [...suchAsMatch[1].matchAll(/`?([A-Z][A-Za-z0-9]*)`?/g)].map((m) => m[1]);
    const mapping = buildReplacementFromNames(segmentNames, mmdsList, packageName);
    if (mapping) return mapping;
  }

  return null;
}

function getReplacementOptions(replacement) {
  if (!replacement) return [];

  if (Array.isArray(replacement.replacementOptions) && replacement.replacementOptions.length > 0) {
    return [...new Set(replacement.replacementOptions)];
  }

  return [...new Set([replacement.component, ...(replacement.alternatives || [])].filter(Boolean))];
}

function formatReplacementDisplay(replacement) {
  if (!replacement || !isMmdsPackage(replacement.package)) return null;

  const options = getReplacementOptions(replacement);
  if (options.length === 0) return replacement.component;
  if (options.length === 1) return options[0];
  if (options.length <= 3) return options.join(' · ');
  return `${options.slice(0, 2).join(' · ')} +${options.length - 2}`;
}

function extractGuidanceSnippet(message, maxLen = 120) {
  if (!message) return null;

  const cleaned = message
    .replace(/\*\//g, '')
    .replace(/\/\*\*?/g, '')
    .replace(/\*\s*\n\s*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const deprecatedIdx = cleaned.toLowerCase().indexOf('@deprecated');
  const text = deprecatedIdx >= 0
    ? cleaned.slice(deprecatedIdx + '@deprecated'.length).trim()
    : cleaned;

  const firstSentence = text.split(/\.\s+/)[0]?.trim() || text;
  if (firstSentence.length <= maxLen) return firstSentence;
  return `${firstSentence.slice(0, maxLen - 1)}…`;
}

function buildLegacyReplacementEntry(replacement, deprecationMessage) {
  const displayReplacement = formatReplacementDisplay(replacement);
  const replacementOptions = isMmdsPackage(replacement?.package)
    ? getReplacementOptions(replacement)
    : [];

  return {
    replacement: displayReplacement,
    replacementOptions,
    package: isMmdsPackage(replacement?.package) ? replacement.package : null,
    guidance: displayReplacement ? null : extractGuidanceSnippet(deprecationMessage),
  };
}

function toPascalCase(str) {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

module.exports = {
  mapComponent,
  MANUAL_MAPPINGS,
  isMmdsPackage,
  getReplacementOptions,
  formatReplacementDisplay,
  extractGuidanceSnippet,
  buildLegacyReplacementEntry,
};
