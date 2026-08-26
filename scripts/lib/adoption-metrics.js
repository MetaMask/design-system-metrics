/**
 * Shared adoption formula used by the adoption page headline and untracked timeline.
 *
 * Adoption % = MMDS ÷ (MMDS + deprecated + replaceable local one-offs)
 *
 * Candidate one-offs (no MMDS match yet) are excluded — they are tracked separately
 * as roadmap signals, not as adoption blockers with a known replacement path.
 */

function computeAdoptionPercentage(trackedMMDS, trackedDeprecated, replaceableInstances) {
  const total = trackedMMDS + trackedDeprecated + replaceableInstances;
  if (total <= 0) return null;
  return parseFloat(((trackedMMDS / total) * 100).toFixed(2));
}

module.exports = { computeAdoptionPercentage };
