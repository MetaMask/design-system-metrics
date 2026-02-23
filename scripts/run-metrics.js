#!/usr/bin/env node

/**
 * Helper script to run metrics from the git submodules
 *
 * Usage:
 *   node scripts/run-metrics.js extension
 *   node scripts/run-metrics.js mobile
 */

const { execSync } = require('child_process');
const path = require('path');

const project = process.argv[2];

if (!project || !['extension', 'mobile'].includes(project)) {
  console.error('Usage: node scripts/run-metrics.js [extension|mobile]');
  process.exit(1);
}

const REPO_ROOT = path.join(__dirname, '..');
const REPO_MAP = {
  extension: 'metamask-extension',
  mobile: 'metamask-mobile'
};

const repoPath = path.join(REPO_ROOT, 'repos', REPO_MAP[project]);
const configPath = path.join(REPO_ROOT, 'config.json');
const indexPath = path.join(REPO_ROOT, 'index.js');

console.log(`\n🚀 Running metrics for ${project}...`);
console.log(`📂 Repo: ${repoPath}`);
console.log(`📋 Config: ${configPath}\n`);

try {
  execSync(`node "${indexPath}" --project ${project} --config "${configPath}"`, {
    cwd: repoPath,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: path.join(REPO_ROOT, 'node_modules')
    }
  });
} catch (err) {
  console.error(`\n❌ Failed to run metrics: ${err.message}`);
  process.exit(1);
}
