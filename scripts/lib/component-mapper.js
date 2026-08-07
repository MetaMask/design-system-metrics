/**
 * Intelligent component mapper
 *
 * Maps deprecated components to their MMDS replacements using:
 * 1. Manual mapping table (special cases)
 * 2. Explicit hints from @deprecated messages
 * 3. Exact name matching
 * 4. Returns null if no replacement exists
 */

// Manual mappings for special cases where names don't match 1:1
const MANUAL_MAPPINGS = {
  extension: {
    // Button variants → single Button component
    ButtonPrimary: { component: 'Button', package: '@metamask/design-system-react' },
    ButtonSecondary: { component: 'Button', package: '@metamask/design-system-react' },
    ButtonLink: { component: 'TextButton', package: '@metamask/design-system-react' },

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

    // Sheet components → BottomSheet (intermediate migration to component-library)
    SheetBottom: {
      component: 'BottomSheet',
      package: 'component-library',
      path: 'app/component-library/components/BottomSheets/BottomSheet'
    },
    SheetHeader: {
      component: 'BottomSheetHeader',
      package: 'component-library',
      path: 'app/component-library/components/BottomSheets/BottomSheetHeader'
    },
  },
};

/**
 * Map a deprecated component to its MMDS replacement
 *
 * @param {Object} component - Deprecated component info
 * @param {string} component.name - Component name
 * @param {string} component.deprecationMessage - Full @deprecated message
 * @param {string} component.project - 'extension' or 'mobile'
 * @param {Object} mmdsComponents - Available MMDS components
 * @param {string[]} mmdsComponents.react - React components
 * @param {string[]} mmdsComponents.reactNative - React Native components
 * @returns {Object|null} - Replacement info or null
 */
function mapComponent(component, mmdsComponents) {
  const { name, deprecationMessage, project } = component;

  // 1. Check manual mapping table first
  const manualMapping = MANUAL_MAPPINGS[project]?.[name];
  if (manualMapping) {
    return manualMapping;
  }

  const mmdsPackage = project === 'extension'
    ? '@metamask/design-system-react'
    : '@metamask/design-system-react-native';

  const mmdsList = project === 'extension'
    ? mmdsComponents.react
    : mmdsComponents.reactNative;

  // 2. Parse deprecation message for explicit MMDS package hints
  const mmdsHint = parseMmdsDeprecationHint(deprecationMessage);
  if (mmdsHint) {
    return mmdsHint;
  }

  // 3. Prefer exact MMDS name match over intermediate in-repo paths.
  // Mobile sometimes deprecates toward components-temp first while MMDS already
  // ships the same component (e.g. Skeleton).
  if (mmdsList.includes(name)) {
    return {
      component: name,
      package: mmdsPackage,
    };
  }

  // 4. Intermediate component-library / components-temp migration targets
  const libHint = parseComponentLibraryHint(deprecationMessage, project);
  if (libHint) {
    return libHint;
  }

  // 5. No replacement found
  return null;
}

/**
 * Parse @deprecated message for explicit MMDS package replacement hints.
 *
 * Examples:
 * - "use Button from @metamask/design-system-react"
 * - "Please update your code to use `Button` from `@metamask/design-system-react-native`"
 *
 * @param {string} message - Deprecation message
 * @returns {Object|null}
 */
function parseMmdsDeprecationHint(message) {
  if (!message) return null;

  const mmdsPattern = /use\s+`?(\w+)`?\s+from\s+`?(@metamask\/design-system[^`\s]+)`?/i;
  const match = message.match(mmdsPattern);
  if (!match) return null;

  return {
    component: match[1],
    package: match[2],
  };
}

/**
 * Parse @deprecated message for intermediate in-repo component-library targets.
 *
 * @param {string} message - Deprecation message
 * @param {string} project - 'extension' or 'mobile'
 * @returns {Object|null}
 */
function parseComponentLibraryHint(message, project) {
  if (!message) return null;

  const componentLibPattern = /component-library\/([^/\s]+)/i;
  const libMatch = message.match(componentLibPattern);
  if (!libMatch) return null;

  const componentName = toPascalCase(libMatch[1]);
  return {
    component: componentName,
    package: 'component-library',
    path: project === 'extension'
      ? `ui/components/component-library/${libMatch[1]}`
      : `app/component-library/components/${componentName}`,
  };
}

/**
 * Parse @deprecated message for explicit replacement hints
 *
 * @param {string} message - Deprecation message
 * @param {string} project - 'extension' or 'mobile'
 * @returns {Object|null}
 */
function parseDeprecationHint(message, project) {
  return parseMmdsDeprecationHint(message) || parseComponentLibraryHint(message, project);
}

/**
 * Convert kebab-case to PascalCase
 * @param {string} str - kebab-case string
 * @returns {string} - PascalCase string
 */
function toPascalCase(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

module.exports = {
  mapComponent,
  MANUAL_MAPPINGS,
};
