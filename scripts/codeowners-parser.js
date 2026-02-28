/**
 * CODEOWNERS Parser Utility
 *
 * Parses GitHub CODEOWNERS files and matches file paths to their owners
 */

const fs = require('fs');
const path = require('path');
const minimatch = require('minimatch');

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
        // Convert glob pattern to regex for faster matching
        glob: pattern
      });
    }

    // Reverse rules so more specific rules (later in file) take precedence
    this.rules.reverse();
  }

  /**
   * Find owners for a given file path
   * Returns array of owner teams/users
   */
  getOwners(filePath) {
    // Normalize path separators
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const rule of this.rules) {
      // Use minimatch for glob pattern matching
      if (minimatch(normalizedPath, rule.glob, { matchBase: true })) {
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
