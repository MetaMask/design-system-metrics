/**
 * CODEOWNERS Parser Utility
 *
 * Parses GitHub CODEOWNERS files and matches file paths to their owners
 */

const fs = require('fs');
const path = require('path');
const { minimatch } = require('minimatch');

class CodeOwnersParser {
  constructor(codeownersPath) {
    this.rules = [];
    this.parse(codeownersPath);
  }

  /**
   * Parse CODEOWNERS file and extract rules
   */
  parse(codeownersPath) {
    if (!fs.existsSync(codeownersPath)) {
      console.warn(`CODEOWNERS file not found: ${codeownersPath}`);
      return;
    }

    const content = fs.readFileSync(codeownersPath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse pattern and owners
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) {
        continue;
      }

      const pattern = parts[0];
      const owners = parts.slice(1);

      this.rules.push({
        pattern,
        owners,
        matcher: this.createMatcher(pattern),
      });
    }

    // Reverse rules so more specific rules (later in file) take precedence
    this.rules.reverse();
  }

  /**
   * Create a matcher function for a CODEOWNERS pattern.
   * This approximates gitignore-style matching used by CODEOWNERS:
   * - Leading "/" anchors pattern at repo root.
   * - Patterns without leading "/" can match at any depth.
   * - Trailing "/" implies directory and all descendants.
   */
  createMatcher(pattern) {
    let normalizedPattern = pattern.trim().replace(/\\/g, '/');
    const anchoredToRoot = normalizedPattern.startsWith('/');
    const hasGlob = /[*?[\]{}()!+@]/.test(normalizedPattern);

    if (anchoredToRoot) {
      normalizedPattern = normalizedPattern.slice(1);
    }

    const directoryPattern = normalizedPattern.endsWith('/');
    const basename = path.posix.basename(normalizedPattern);
    const looksLikeFile = basename.includes('.');
    if (directoryPattern) {
      normalizedPattern = `${normalizedPattern}**`;
    }

    const hasSlash = normalizedPattern.includes('/');
    const candidates = [];
    const includeDescendants = !directoryPattern && !hasGlob && !looksLikeFile;
    const descendantPattern = includeDescendants
      ? `${normalizedPattern}/**`
      : null;

    if (anchoredToRoot) {
      candidates.push(normalizedPattern);
      if (descendantPattern) {
        candidates.push(descendantPattern);
      }
    } else if (hasSlash) {
      candidates.push(normalizedPattern);
      if (descendantPattern) {
        candidates.push(descendantPattern);
      }
      candidates.push(`**/${normalizedPattern}`);
      if (descendantPattern) {
        candidates.push(`**/${descendantPattern}`);
      }
    } else {
      candidates.push(`**/${normalizedPattern}`);
      if (descendantPattern) {
        candidates.push(`**/${descendantPattern}`);
      }
    }

    return (filePath) =>
      candidates.some((candidate) =>
        minimatch(filePath, candidate, { dot: true }),
      );
  }

  /**
   * Find owners for a given file path
   * Returns array of owner teams/users
   */
  getOwners(filePath) {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');

    for (const rule of this.rules) {
      if (rule.matcher(normalizedPath)) {
        return rule.owners;
      }
    }

    return ['@unknown'];
  }

  /**
   * Get primary owner (first listed owner)
   */
  getPrimaryOwner(filePath) {
    const owners = this.getOwners(filePath);
    return owners[0] || '@unknown';
  }

  /**
   * Get all unique teams from CODEOWNERS
   */
  getAllTeams() {
    const teams = new Set();
    for (const rule of this.rules) {
      for (const owner of rule.owners) {
        teams.add(owner);
      }
    }
    return Array.from(teams).sort();
  }
}

module.exports = CodeOwnersParser;
