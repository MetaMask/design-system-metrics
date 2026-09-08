const MIN_WEEKLY_TIMELINE_GAP_DAYS = 7;

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

function weeklyTimelineIndices(dates) {
  if (dates.length === 0) return [];
  const indices = [0];
  for (let i = 1; i < dates.length; i++) {
    const lastIdx = indices[indices.length - 1];
    if (daysBetween(dates[lastIdx], dates[i]) >= MIN_WEEKLY_TIMELINE_GAP_DAYS) {
      indices.push(i);
    }
  }
  return indices;
}

describe('alignment weekly timeline cadence', () => {
  test('drops same-week re-scans within 7 days', () => {
    expect(weeklyTimelineIndices(['2026-09-07', '2026-09-08'])).toEqual([0]);
  });

  test('keeps scans at least one week apart', () => {
    expect(weeklyTimelineIndices(['2026-09-07', '2026-09-14'])).toEqual([0, 1]);
  });

  test('keeps first point and skips mid-week duplicates in a longer series', () => {
    expect(
      weeklyTimelineIndices(['2026-08-31', '2026-09-07', '2026-09-08', '2026-09-14']),
    ).toEqual([0, 1, 3]);
  });
});

describe('discover-alignment daysBetweenDates', () => {
  test('counts calendar days between metric dates', () => {
    expect(daysBetween('2026-09-07', '2026-09-08')).toBe(1);
    expect(daysBetween('2026-09-07', '2026-09-14')).toBe(7);
  });
});
