const fs = require('fs').promises;
const path = require('path');
const { parseComponentsFromIndexContent } = require('./component-export-parser');

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
    return parseComponentsFromIndexContent(content);
  } catch (err) {
    console.error(`Failed to parse ${filePath}:`, err.message);
    return [];
  }
}

module.exports = {
  fetchMMDSComponents,
};
