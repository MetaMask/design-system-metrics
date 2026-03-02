#!/usr/bin/env node

/**
 * Historical Metrics Collection Script
 *
 * Collects component migration metrics for historical dates by:
 * 1. Finding nearest commits to target dates in extension/mobile repos
 * 2. Checking out repos to those commits
 * 3. Running metrics collection
 * 4. Restoring repos to current state
 *
 * Usage:
 *   node scripts/collect-historical-metrics.js [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--test]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..');
const EXTENSION_REPO = path.join(REPO_ROOT, 'repos/metamask-extension');
const MOBILE_REPO = path.join(REPO_ROOT, 'repos/metamask-mobile');

// Parse CLI arguments
const args = process.argv.slice(2);
const testMode = args.includes('--test');
const startDateArg = args.find(arg => arg.startsWith('--start='));
const endDateArg = args.find(arg => arg.startsWith('--end='));

/**
 * Get list of target Fridays between start and end date
 */
function getTargetFridays(startDate, endDate) {
  const fridays = [];
  const current = new Date(endDate);
  const start = new Date(startDate);

  // Adjust to most recent Friday from endDate
  while (current.getDay() !== 5) {
    current.setDate(current.getDate() - 1);
  }

  // Walk backwards collecting Fridays
  while (current >= start) {
    fridays.push(new Date(current));
    current.setDate(current.getDate() - 7); // Go back one week
  }

  return fridays.reverse(); // Return oldest to newest
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get most recent Friday from a given date (including same day if Friday)
 */
function getMostRecentFriday(inputDate = new Date()) {
  const date = new Date(inputDate);
  while (date.getDay() !== 5) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

/**
 * Find nearest commit to target date (within ±3 days)
 */
function findNearestCommit(repoPath, targetDate) {
  const dateStr = formatDate(targetDate);

  // Search for commits within ±3 days
  const beforeDate = new Date(targetDate);
  beforeDate.setDate(beforeDate.getDate() + 3);
  const afterDate = new Date(targetDate);
  afterDate.setDate(afterDate.getDate() - 3);

  const beforeStr = formatDate(beforeDate);
  const afterStr = formatDate(afterDate);

  try {
    // Find commits in date range
    const result = execSync(
      `git log --after="${afterStr}" --before="${beforeStr}" --format="%H %ci" --max-count=1`,
      { cwd: repoPath, encoding: 'utf8' }
    ).trim();

    if (!result) {
      console.warn(`  ⚠️  No commits found near ${dateStr} in ${path.basename(repoPath)}`);
      return null;
    }

    const [hash, commitDate] = result.split(' ', 2);
    return { hash, date: commitDate.split(' ')[0] };
  } catch (err) {
    console.error(`  ❌ Error finding commit in ${path.basename(repoPath)}:`, err.message);
    return null;
  }
}

/**
 * Save current repo state (current branch/commit)
 */
function saveRepoState(repoPath) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
      encoding: 'utf8'
    }).trim();

    const commit = execSync('git rev-parse HEAD', {
      cwd: repoPath,
      encoding: 'utf8'
    }).trim();

    return { branch, commit };
  } catch (err) {
    console.error(`Error saving state for ${path.basename(repoPath)}:`, err.message);
    return null;
  }
}

/**
 * Checkout repo to specific commit
 */
function checkoutCommit(repoPath, commitHash) {
  try {
    execSync(`git checkout ${commitHash} --quiet`, {
      cwd: repoPath,
      stdio: 'ignore'
    });
    return true;
  } catch (err) {
    console.error(`  ❌ Error checking out ${commitHash} in ${path.basename(repoPath)}:`, err.message);
    return false;
  }
}

/**
 * Restore repo to previous state
 */
function restoreRepoState(repoPath, state) {
  try {
    if (state.branch === 'HEAD') {
      // Was in detached HEAD state
      execSync(`git checkout ${state.commit} --quiet`, {
        cwd: repoPath,
        stdio: 'ignore'
      });
    } else {
      // Was on a branch
      execSync(`git checkout ${state.branch} --quiet`, {
        cwd: repoPath,
        stdio: 'ignore'
      });
    }
    return true;
  } catch (err) {
    console.error(`Error restoring ${path.basename(repoPath)}:`, err.message);
    return false;
  }
}

/**
 * Run metrics collection for current repo state
 */
function collectMetrics(targetDate) {
  const dateStr = formatDate(targetDate);

  try {
    console.log(`  📊 Running metrics collection...`);

    // Run extension metrics
    execSync('yarn start', {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      env: { ...process.env, METRICS_DATE: dateStr }
    });

    // Run mobile metrics
    execSync('yarn start:mobile', {
      cwd: REPO_ROOT,
      stdio: 'ignore',
      env: { ...process.env, METRICS_DATE: dateStr }
    });

    console.log(`  ✅ Metrics collected successfully`);
    return true;
  } catch (err) {
    console.error(`  ❌ Error collecting metrics:`, err.message);
    return false;
  }
}

/**
 * Process a single historical date
 */
async function processDate(targetDate) {
  const dateStr = formatDate(targetDate);
  console.log(`\n📅 Processing ${dateStr}...`);

  // Find nearest commits
  console.log(`  🔍 Finding nearest commits...`);
  const extensionCommit = findNearestCommit(EXTENSION_REPO, targetDate);
  const mobileCommit = findNearestCommit(MOBILE_REPO, targetDate);

  if (!extensionCommit || !mobileCommit) {
    console.log(`  ⏭️  Skipping ${dateStr} - missing commits`);
    return { success: false, skipped: true };
  }

  console.log(`    Extension: ${extensionCommit.hash.substring(0, 8)} (${extensionCommit.date})`);
  console.log(`    Mobile: ${mobileCommit.hash.substring(0, 8)} (${mobileCommit.date})`);

  // Save current state
  const extensionState = saveRepoState(EXTENSION_REPO);
  const mobileState = saveRepoState(MOBILE_REPO);

  if (!extensionState || !mobileState) {
    console.log(`  ❌ Failed to save repo states`);
    return { success: false };
  }

  try {
    // Checkout to historical commits
    console.log(`  📦 Checking out historical commits...`);
    const extensionCheckout = checkoutCommit(EXTENSION_REPO, extensionCommit.hash);
    const mobileCheckout = checkoutCommit(MOBILE_REPO, mobileCommit.hash);

    if (!extensionCheckout || !mobileCheckout) {
      throw new Error('Failed to checkout commits');
    }

    // Collect metrics
    const success = collectMetrics(targetDate);

    if (!success) {
      throw new Error('Failed to collect metrics');
    }

    return { success: true };
  } catch (err) {
    console.error(`  ❌ Error processing ${dateStr}:`, err.message);
    return { success: false };
  } finally {
    // Always restore repos
    console.log(`  🔄 Restoring repos to current state...`);
    restoreRepoState(EXTENSION_REPO, extensionState);
    restoreRepoState(MOBILE_REPO, mobileState);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Historical Metrics Collection\n');

  // Determine date range
  let endDate, startDate;

  if (endDateArg) {
    endDate = new Date(endDateArg.split('=')[1]);
  } else {
    endDate = getMostRecentFriday(new Date());
  }

  if (startDateArg) {
    startDate = new Date(startDateArg.split('=')[1]);
  } else if (testMode) {
    // Test mode: only last 3 Fridays
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 14);
    console.log('🧪 TEST MODE: Collecting last 3 Fridays only\n');
  } else {
    // Full mode: 26 weeks (6 months)
    startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (25 * 7));
  }

  // Get target Fridays
  const fridays = getTargetFridays(startDate, endDate);

  console.log(`📆 Target dates: ${formatDate(startDate)} to ${formatDate(endDate)}`);
  console.log(`📊 Total dates to process: ${fridays.length}\n`);

  // Process each Friday
  const results = [];
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const friday of fridays) {
    const result = await processDate(friday);
    results.push({ date: friday, ...result });

    if (result.success) {
      successCount++;
    } else if (result.skipped) {
      skipCount++;
    } else {
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Collection Summary');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${successCount}/${fridays.length}`);
  console.log(`⏭️  Skipped: ${skipCount}/${fridays.length}`);
  console.log(`❌ Failed: ${failCount}/${fridays.length}`);
  console.log('='.repeat(60));

  if (failCount > 0) {
    console.log('\n❌ Failed dates:');
    results
      .filter(r => !r.success && !r.skipped)
      .forEach(r => console.log(`  - ${formatDate(r.date)}`));
  }

  // Refresh derived dashboard artifacts once all historical points are collected.
  try {
    console.log('\n🔄 Rebuilding timeline/index and validating consistency...');
    execSync('yarn update-timeline', { cwd: REPO_ROOT, stdio: 'inherit' });
    execSync('yarn validate-metrics', { cwd: REPO_ROOT, stdio: 'inherit' });
    execSync('cp metrics/*.json dashboard/public/metrics/', { cwd: REPO_ROOT, stdio: 'inherit' });
    console.log('✅ Timeline/index refreshed and dashboard metrics synced');
  } catch (err) {
    console.error('❌ Failed to refresh derived artifacts:', err.message);
    process.exit(1);
  }

  console.log('\n✨ Historical metrics collection complete!\n');
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
