import type { AlignmentTimeline } from '../types/metrics';

/** Minimum days between timeline points — matches weekly reporting cadence. */
export const MIN_WEEKLY_TIMELINE_GAP_DAYS = 7;

export function daysBetweenDates(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

/**
 * Timeline indices kept for trend charts — at most one point per week.
 * Mid-week re-scans (e.g. a local run the day after the weekly scan) are dropped.
 */
export function weeklyTimelineIndices(dates: string[]): number[] {
  if (dates.length === 0) return [];
  const indices = [0];
  for (let i = 1; i < dates.length; i++) {
    const lastIdx = indices[indices.length - 1];
    if (daysBetweenDates(dates[lastIdx], dates[i]) >= MIN_WEEKLY_TIMELINE_GAP_DAYS) {
      indices.push(i);
    }
  }
  return indices;
}

export interface AlignmentChartPoint {
  date: string;
  coverage: number | null;
  codeConnect: number | null;
  openGaps: number | null;
  missingReact: number | null;
}

export function buildWeeklyAlignmentChartSeries(
  timeline: AlignmentTimeline,
): AlignmentChartPoint[] {
  return weeklyTimelineIndices(timeline.dates).map((i) => ({
    date: timeline.dates[i],
    coverage: timeline.requiredCoverage[i] ?? null,
    codeConnect: timeline.codeConnectCoverage[i] ?? null,
    openGaps: timeline.openGaps[i] ?? null,
    missingReact: timeline.missingOnReact[i] ?? null,
  }));
}

/** Compare headline to the prior weekly timeline point (ignores same-week re-scans). */
export function headlineWeeklyDelta(
  timeline: AlignmentTimeline | null,
  headlineValue: number,
  series: (number | null)[],
): number | null {
  if (!timeline) return null;
  const indices = weeklyTimelineIndices(timeline.dates);
  if (indices.length < 2) return null;

  const priorIdx = indices[indices.length - 2];
  const prior = series[priorIdx];
  if (prior == null) return null;

  const delta = headlineValue - prior;
  return Number.isInteger(delta) ? delta : Math.round(delta * 10) / 10;
}
