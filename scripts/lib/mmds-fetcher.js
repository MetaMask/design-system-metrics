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
 * Parse an index.ts file to extract component names
 *
 * Matches patterns like:
 * export { Button, ButtonSize } from './Button';
 * export type { ButtonProps } from './Button';
 *
 * @param {string} filePath - Path to index.ts file
 * @returns {Promise<string[]>} - Array of component names
 */
async function parseIndexFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const components = new Set();

    // Match: export { ComponentName, ... } from './ComponentName';
    // Captures the main component name (not props types or variants)
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

      // The component name should match the folder name (usually)
      // e.g., export { Button, ButtonSize } from './Button' → Button is the component
      if (exportedNames.length > 0) {
        // Heuristic: The component name is usually the same as the folder name
        const componentName = exportedNames.find(name => name === folder) || exportedNames[0];
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
