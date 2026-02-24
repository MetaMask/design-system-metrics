const fs = require('fs').promises;
const { glob } = require('glob');
const path = require('path');
const babelParser = require('@babel/parser');

/**
 * Scan repositories for deprecated components
 *
 * @param {string} repoPath - Path to repo (extension or mobile)
 * @param {string} project - 'extension' or 'mobile'
 * @returns {Promise<Array>} - Array of discovered deprecated components
 */
async function scanForDeprecated(repoPath, project) {
  const patterns = getScanPatterns(project);
  const allComponents = [];

  for (const pattern of patterns) {
    const fullPattern = path.join(repoPath, pattern);
    const files = await glob(fullPattern, { ignore: ['**/*.test.{js,tsx,ts}', '**/*.stories.{js,tsx,ts}'] });

    for (const filePath of files) {
      const components = await scanFile(filePath, project);
      allComponents.push(...components);
    }
  }

  return allComponents;
}

/**
 * Get scan patterns for each project
 *
 * @param {string} project - 'extension' or 'mobile'
 * @returns {string[]} - Glob patterns
 */
function getScanPatterns(project) {
  if (project === 'extension') {
    return [
      'ui/components/component-library/**/*.{js,jsx,ts,tsx}',
    ];
  }

  // mobile
  return [
    'app/component-library/**/*.{js,jsx,ts,tsx}',
  ];
}

/**
 * Scan a single file for ALL component exports
 * (All components in these directories are deprecated by virtue of being there)
 *
 * @param {string} filePath - Path to file
 * @param {string} project - 'extension' or 'mobile'
 * @returns {Promise<Array>} - Array of all components found in this file
 */
async function scanFile(filePath, project) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const components = [];

    // Parse file with Babel
    let ast;
    try {
      ast = babelParser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        attachComment: true, // Attaches JSDoc comments to nodes
      });
    } catch (parseError) {
      // Skip files that can't be parsed
      return [];
    }

    // Build a map of @deprecated comments for hint extraction
    const deprecationHints = extractDeprecationHints(ast);

    // Find ALL exported components
    for (const node of ast.program.body) {
      const componentInfo = extractComponent(node, filePath, project, deprecationHints);
      if (componentInfo) {
        components.push(componentInfo);
      }
    }

    return components;
  } catch (err) {
    console.error(`Error scanning ${filePath}:`, err.message);
    return [];
  }
}

/**
 * Extract deprecation hints from @deprecated comments
 * Returns a map of { componentName: deprecationMessage }
 *
 * @param {Object} ast - Babel AST
 * @returns {Object} - Map of component names to deprecation messages
 */
function extractDeprecationHints(ast) {
  const hints = {};

  if (!ast.comments) return hints;

  for (let i = 0; i < ast.comments.length; i++) {
    const comment = ast.comments[i];

    // Check if comment contains @deprecated
    if (comment.type === 'CommentBlock' && comment.value.includes('@deprecated')) {
      // Find the component this comment applies to
      const componentName = findComponentNameAfterComment(ast, comment);
      if (componentName) {
        hints[componentName] = comment.value;
      }
    }
  }

  return hints;
}

/**
 * Find the component name that follows a comment
 *
 * @param {Object} ast - Babel AST
 * @param {Object} comment - Comment node
 * @returns {string|null} - Component name or null
 */
function findComponentNameAfterComment(ast, comment) {
  const commentEnd = comment.end;

  for (const node of ast.program.body) {
    if (node.start <= commentEnd) continue;

    // export const ComponentName = ...
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.type === 'VariableDeclaration') {
        return node.declaration.declarations[0]?.id?.name;
      } else if (node.declaration?.type === 'FunctionDeclaration') {
        return node.declaration.id?.name;
      }
    }

    // export default ComponentName
    if (node.type === 'ExportDefaultDeclaration') {
      if (node.declaration?.type === 'Identifier') {
        return node.declaration.name;
      } else if (node.declaration?.type === 'FunctionDeclaration') {
        return node.declaration.id?.name;
      }
    }

    // const ComponentName = ... (check if component-like)
    if (node.type === 'VariableDeclaration') {
      const declarator = node.declarations[0];
      const name = declarator?.id?.name;
      if (name && name[0] === name[0].toUpperCase()) {
        return name;
      }
    }

    // function ComponentName()
    if (node.type === 'FunctionDeclaration') {
      const name = node.id?.name;
      if (name && name[0] === name[0].toUpperCase()) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Extract component info from an AST node
 *
 * @param {Object} node - AST node
 * @param {string} filePath - File path
 * @param {string} project - 'extension' or 'mobile'
 * @param {Object} deprecationHints - Map of component names to deprecation messages
 * @returns {Object|null} - Component info or null
 */
function extractComponent(node, filePath, project, deprecationHints) {
  let componentName = null;

  // export const ComponentName = ...
  // export function ComponentName() ...
  if (node.type === 'ExportNamedDeclaration') {
    if (node.declaration?.type === 'VariableDeclaration') {
      componentName = node.declaration.declarations[0]?.id?.name;
    } else if (node.declaration?.type === 'FunctionDeclaration') {
      componentName = node.declaration.id?.name;
    }
  }

  // export default ComponentName
  if (node.type === 'ExportDefaultDeclaration') {
    if (node.declaration?.type === 'Identifier') {
      componentName = node.declaration.name;
    } else if (node.declaration?.type === 'FunctionDeclaration') {
      componentName = node.declaration.id?.name;
    }
  }

  // Filter out non-components
  if (componentName && isLikelyComponent(componentName, filePath)) {
    return {
      name: componentName,
      filePath: filePath,
      relativePath: getRelativePath(filePath, project),
      deprecationMessage: deprecationHints[componentName] || null,
      project: project,
    };
  }

  return null;
}

/**
 * Heuristic to determine if an export is likely a component
 *
 * @param {string} name - Export name
 * @param {string} filePath - File path
 * @returns {boolean}
 */
function isLikelyComponent(name, filePath) {
  // Must start with uppercase (PascalCase)
  if (!name || name[0] !== name[0].toUpperCase()) {
    return false;
  }

  // Exclude common non-component patterns
  const excludePatterns = [
    // Constants
    /^[A-Z_]+$/,  // ALL_CAPS_CONSTANT
    /^MOCK_/i,    // Mock data
    /^DEFAULT_/i, // Default values

    // TypeScript types/enums
    /Type$/,
    /Types$/,
    /Enum$/,

    // Utilities/helpers
    /^use[A-Z]/,  // React hooks (useHook)
    /^get[A-Z]/,  // Getter functions
    /^set[A-Z]/,  // Setter functions
    /^is[A-Z]/,   // Boolean checks
    /^has[A-Z]/,  // Boolean checks
    /^should[A-Z]/, // Boolean checks
    /^fetch[A-Z]/, // Data fetchers
    /^calculate[A-Z]/, // Calculators
    /^format[A-Z]/, // Formatters
    /^parse[A-Z]/, // Parsers
    /^transform[A-Z]/, // Transformers
    /^map[A-Z]/,  // Mappers
    /^filter[A-Z]/, // Filters
    /^build[A-Z]/, // Builders
    /^extract[A-Z]/, // Extractors
    /^combine[A-Z]/, // Combiners
    /^merge[A-Z]/, // Mergers
    /^group[A-Z]/, // Groupers
    /^sort[A-Z]/, // Sorters
    /^aggregate[A-Z]/, // Aggregators
    /^select[A-Z]/, // Selectors
    /^handle[A-Z]/, // Event handlers
    /^render[A-Z]/, // Render utilities
    /^determine[A-Z]/, // Determiners
    /^compare[A-Z]/, // Comparers
    /^strip[A-Z]/, // String utilities
    /^open[A-Z]/, // Action utilities

    // Context/Provider utilities
    /Context$/,
    /Provider$/,
  ];

  for (const pattern of excludePatterns) {
    if (pattern.test(name)) {
      return false;
    }
  }

  // Files in utils/, helpers/, hooks/, constants/ are likely not components
  if (filePath.includes('/utils/') ||
      filePath.includes('/helpers/') ||
      filePath.includes('/hooks/') ||
      filePath.includes('/constants/')) {
    return false;
  }

  return true;
}

/**
 * Get relative path from project root
 *
 * @param {string} absolutePath - Absolute file path
 * @param {string} project - 'extension' or 'mobile'
 * @returns {string} - Relative path
 */
function getRelativePath(absolutePath, project) {
  // Extract the path starting from ui/ or app/
  const prefix = project === 'extension' ? 'ui/' : 'app/';
  const index = absolutePath.indexOf(prefix);

  if (index !== -1) {
    return absolutePath.substring(index);
  }

  return absolutePath;
}

module.exports = {
  scanForDeprecated,
};
