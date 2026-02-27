const fs = require('fs').promises;
const path = require('path');

/**
 * Fetches the list of available MMDS components from the design system packages
 *
 * Parses the index.ts files from:
 * - packages/design-system-react/src/components/index.ts
 * - packages/design-system-react-native/src/components/index.ts
 *
 * @param {string} mmdsRepoPath - Path to metamask-design-system repo
 * @returns {Promise<{react: string[], reactNative: string[]}>}
 */
async function fetchMMDSComponents(mmdsRepoPath) {
  const reactPath = path.join(
    mmdsRepoPath,
    'packages/design-system-react/src/components/index.ts'
  );

  const reactNativePath = path.join(
    mmdsRepoPath,
    'packages/design-system-react-native/src/components/index.ts'
  );

  const [reactComponents, reactNativeComponents] = await Promise.all([
    parseIndexFile(reactPath),
    parseIndexFile(reactNativePath),
  ]);

  return {
    react: reactComponents,
    reactNative: reactNativeComponents,
  };
}

/**
 * Parse an index.ts file to extract React/React Native component names only
 *
 * Filters out TypeScript types, enums, and other non-component exports
 *
 * Matches patterns like:
 * export { Button, ButtonSize } from './Button';  → Extracts only 'Button'
 * export type { ButtonProps } from './Button';    → Skips (type export)
 *
 * @param {string} filePath - Path to index.ts file
 * @returns {Promise<string[]>} - Array of React/RN component names only
 */
async function parseIndexFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const components = new Set();

    // Common enum/type suffixes that are NOT components
    const nonComponentSuffixes = [
      'Size', 'Variant', 'Color', 'Status', 'Position', 'Shape', 'Severity',
      'Props', 'Type', 'Name', 'Align', 'Direction', 'Wrap', 'Items', 'Content',
      'BackgroundColor', 'BorderColor', 'Weight', 'Family', 'Style', 'Transform',
      'OverflowWrap', 'FlexDirection', 'FlexWrap', 'AlignItems', 'JustifyContent',
      'AnchorShape', 'CustomPosition'
    ];

    // Match: export { ComponentName, ... } from './ComponentName';
    const exportRegex = /export\s+\{\s*([^}]+)\s*\}\s+from\s+['"]\.\/([^'"]+)['"]/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const exports = match[1];
      const folder = match[2];

      // Split by comma and clean up
      const exportedNames = exports
        .split(',')
        .map(name => name.trim())
        .filter(name => name && !name.includes('type'));

      // Filter to only component names (match folder name)
      // Components typically match the folder name exactly
      // e.g., export { Button, ButtonSize } from './Button' → Only 'Button' is the component
      if (exportedNames.length > 0) {
        const componentName = exportedNames.find(name => name === folder);

        // Only add if it matches the folder name AND doesn't look like an enum/type
        if (componentName && !nonComponentSuffixes.some(suffix => componentName.endsWith(suffix))) {
          components.add(componentName);
        }
      }
    }

    return Array.from(components).sort();
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err.message);
    return [];
  }
}

module.exports = {
  fetchMMDSComponents,
};
