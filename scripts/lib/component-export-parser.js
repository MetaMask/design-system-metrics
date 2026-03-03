/**
 * Parse MMDS component exports from a package components index.ts content.
 *
 * Rule: a component is counted when an exported symbol exactly matches the
 * final path segment (folder/file name) for that export line.
 */
function parseComponentsFromIndexContent(content) {
  const components = new Set();
  const exportRegex = /export\s+\{\s*([^}]+)\s*\}\s+from\s+['"]\.\/([^'"]+)['"]/g;

  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    const exportsField = match[1];
    const importPath = match[2];
    const baseName = importPath.split('/').pop();

    const exportedNames = exportsField
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && !name.includes('type'));

    const componentName = exportedNames.find((name) => name === baseName);
    if (componentName) {
      components.add(componentName);
    }
  }

  return Array.from(components).sort();
}

module.exports = {
  parseComponentsFromIndexContent,
};
