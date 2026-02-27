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
 * export { Blockies } from './temp-components/Blockies'; → Extracts 'Blockies'
 * export type { ButtonProps } from './Button';    → Skips (type export)
 *
 * Strategy:
 * 1. Find exports where the name exactly matches the folder/file name
 * 2. Extract the base component name from the path
 * 3. If exported name matches base name, it's a component
 *
 * @param {string} filePath - Path to index.ts file
 * @returns {Promise<string[]>} - Array of React/RN component names only
 */
async function parseIndexFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const components = new Set();

    // Match: export { ComponentName, ... } from './path/to/ComponentName';
    const exportRegex = /export\s+\{\s*([^}]+)\s*\}\s+from\s+['"]\.\/([^'"]+)['"]/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      const exports = match[1];
      const importPath = match[2]; // e.g., 'Button' or 'temp-components/Blockies'

      // Extract the base component name from the path (last segment)
      // 'Button' → 'Button'
      // 'temp-components/Blockies' → 'Blockies'
      const baseName = importPath.split('/').pop();

      // Split exports by comma and clean up
      const exportedNames = exports
        .split(',')
        .map(name => name.trim())
        .filter(name => name && !name.includes('type'));

      // Find exports that exactly match the base component name
      // e.g., export { Button, ButtonSize } from './Button' → 'Button' matches
      // e.g., export { BadgeStatus } from './BadgeStatus' → 'BadgeStatus' matches
      // e.g., export { BadgeStatusStatus, BadgeStatusSize } from './BadgeStatus' → no match
      const componentName = exportedNames.find(name => name === baseName);

      if (componentName) {
        components.add(componentName);
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
