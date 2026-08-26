/**
 * Adoption % = MMDS ÷ (MMDS + deprecated + replaceable local one-offs).
 * Candidate one-offs are excluded (see adoption page headline).
 */
export function computeAdoptionPercentage(
  trackedMMDS: number,
  trackedDeprecated: number,
  replaceableInstances: number,
): number | null {
  const total = trackedMMDS + trackedDeprecated + replaceableInstances;
  if (total <= 0) return null;
  return parseFloat(((trackedMMDS / total) * 100).toFixed(1));
}

/** Week-over-week delta between the last two values (returns 0 when only one point). */
export function weekOverWeekDelta(values: number[]): number {
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[values.length - 2];
}

/** Format a signed delta for display (+N / −N / 0). */
export function formatSignedDelta(value: number, unit = ''): string {
  if (value === 0) return `0${unit}`;
  const sign = value > 0 ? '+' : '';
  return `${sign}${unit === ' pp' ? value.toFixed(1) : value.toLocaleString()}${unit}`;
}
