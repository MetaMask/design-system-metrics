/**
 * Adoption % = MMDS ÷ (MMDS + deprecated + replaceable local one-offs).
 * Candidate one-offs are excluded (see adoption page headline).
 */
import type { CodeOwnerTimeline, UntrackedProjectTimeline } from '../types/metrics';

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

export interface TeamAdoptionDelta {
  adoptionDelta: number | null;
  migrationDelta: number | null;
  replaceableDelta: number | null;
  fromDate: string | null;
  toDate: string | null;
}

function normalizeOwnerKey(owner: string): string {
  return owner.replace('@MetaMask/', '').replace(/^@/, '').toLowerCase();
}

function findTimelineDateIndex(dates: string[], target: string): number {
  return dates.lastIndexOf(target);
}

function teamReplaceableAt(
  timeline: UntrackedProjectTimeline | undefined,
  owner: string,
  dateIdx: number,
): number {
  if (!timeline?.teamReplaceableInstances || dateIdx < 0) return 0;
  const series = timeline.teamReplaceableInstances[owner];
  if (!series || dateIdx >= series.length) return 0;
  return series[dateIdx] ?? 0;
}

function findReplaceableOwnerKey(
  teamReplaceable: UntrackedProjectTimeline['teamReplaceableInstances'],
  team: string,
): string | null {
  if (!teamReplaceable) return null;
  if (teamReplaceable[team]) return team;
  const key = normalizeOwnerKey(team);
  return Object.keys(teamReplaceable).find(owner => normalizeOwnerKey(owner) === key) ?? null;
}

/** Per-team migration and adoption change since the prior report window. */
export function buildTeamAdoptionDeltaMap(
  codeOwnerTimeline: CodeOwnerTimeline | undefined,
  untrackedTimeline: UntrackedProjectTimeline | undefined,
  lookback = 1,
): Map<string, TeamAdoptionDelta> {
  const map = new Map<string, TeamAdoptionDelta>();
  if (!codeOwnerTimeline || codeOwnerTimeline.dates.length < 2) return map;

  const { dates, owners } = codeOwnerTimeline;
  const toIdx = dates.length - 1;
  const fromIdx = Math.max(0, toIdx - lookback);
  const fromDate = dates[fromIdx] ?? null;
  const toDate = dates[toIdx] ?? null;

  const utFromIdx = untrackedTimeline
    ? findTimelineDateIndex(untrackedTimeline.dates, fromDate ?? '')
    : -1;
  const utToIdx = untrackedTimeline
    ? findTimelineDateIndex(untrackedTimeline.dates, toDate ?? '')
    : -1;

  for (const [owner, data] of Object.entries(owners)) {
    const migrationSeries = data.migrationPercentage;
    if (!migrationSeries || migrationSeries.length <= toIdx) continue;

    const mmdsTo = data.mmdsInstances?.[toIdx] ?? 0;
    const mmdsFrom = data.mmdsInstances?.[fromIdx] ?? 0;
    const depTo = data.deprecatedInstances?.[toIdx] ?? 0;
    const depFrom = data.deprecatedInstances?.[fromIdx] ?? 0;

    const replaceableOwner = findReplaceableOwnerKey(
      untrackedTimeline?.teamReplaceableInstances,
      owner,
    );
    const replTo = replaceableOwner && utToIdx >= 0
      ? teamReplaceableAt(untrackedTimeline, replaceableOwner, utToIdx)
      : 0;
    const replFrom = replaceableOwner && utFromIdx >= 0
      ? teamReplaceableAt(untrackedTimeline, replaceableOwner, utFromIdx)
      : 0;

    const adoptionTo = computeAdoptionPercentage(mmdsTo, depTo, replTo);
    const adoptionFrom = computeAdoptionPercentage(mmdsFrom, depFrom, replFrom);

    const migrationTo = migrationSeries[toIdx] ?? 0;
    const migrationFrom = migrationSeries[fromIdx] ?? 0;

    map.set(normalizeOwnerKey(owner), {
      adoptionDelta: adoptionTo != null && adoptionFrom != null
        ? parseFloat((adoptionTo - adoptionFrom).toFixed(1))
        : null,
      migrationDelta: parseFloat((migrationTo - migrationFrom).toFixed(1)),
      replaceableDelta: utFromIdx >= 0 && utToIdx >= 0 ? replTo - replFrom : null,
      fromDate,
      toDate,
    });
  }

  // Include teams that only appear in untracked replaceable history.
  if (untrackedTimeline?.teamReplaceableInstances) {
    for (const owner of Object.keys(untrackedTimeline.teamReplaceableInstances)) {
      const key = normalizeOwnerKey(owner);
      if (map.has(key)) continue;
      const replTo = utToIdx >= 0 ? teamReplaceableAt(untrackedTimeline, owner, utToIdx) : 0;
      const replFrom = utFromIdx >= 0 ? teamReplaceableAt(untrackedTimeline, owner, utFromIdx) : 0;
      map.set(key, {
        adoptionDelta: null,
        migrationDelta: null,
        replaceableDelta: utFromIdx >= 0 && utToIdx >= 0 ? replTo - replFrom : null,
        fromDate,
        toDate,
      });
    }
  }

  return map;
}

export function getTeamAdoptionDelta(
  deltaMap: Map<string, TeamAdoptionDelta>,
  team: string,
): TeamAdoptionDelta | undefined {
  return deltaMap.get(normalizeOwnerKey(team));
}
