import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { CodeOwnerStats, CodeOwnerTimeline, IndexData, MetricsData } from '../types/metrics';

interface CodeOwnerAdoptionChartProps {
  codeOwnerStats: Record<string, CodeOwnerStats>;
  title: string;
  /** Adoption % threshold to highlight. Default: 90 */
  threshold?: number;
  /** Historical timeline for delta badges. Optional. */
  codeOwnerTimeline?: CodeOwnerTimeline;
  /** Project key — used to load dated snapshots for legacy component diffs. */
  project?: 'mobile' | 'extension';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_PATH = import.meta.env.BASE_URL || '/';
const METRICS_PATH = `${BASE_PATH}metrics/`;

function isUnknownOwner(owner: string) {
  const normalized = owner.replace(/^@/, '').toLowerCase();
  return normalized === 'unknown' || normalized === 'metamask/unknown';
}

function formatOwnerLabel(owner: string) {
  if (isUnknownOwner(owner)) return 'No CODEOWNERS';
  return owner.replace('@MetaMask/', '').replace(/^@/, '');
}

function normalizeOwnerKey(owner: string): string {
  return owner.replace('@MetaMask/', '').replace(/^@/, '').toLowerCase();
}

const LEGACY_BAR_FILL = '#e5e7eb';

/** Bar fill based on migration % vs threshold. */
function barFill(pct: number, threshold: number): string {
  if (pct >= threshold) return '#10b981';
  if (pct >= threshold * 0.7) return '#f59e0b';
  return '#ef4444';
}

function TooltipMetricRow({
  color,
  label,
  value,
  swatchClassName,
  labelClassName,
}: {
  color?: string;
  label: string;
  value: string;
  swatchClassName?: string;
  labelClassName?: string;
}) {
  return (
    <p className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-sm shrink-0 ${swatchClassName ?? ''}`}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden
      />
      <span className={labelClassName} style={color ? { color } : undefined}>
        {label}: {value}
      </span>
    </p>
  );
}

interface ComponentDelta {
  component: string;
  delta: number;
  from: number;
  to: number;
}

interface OwnerComponentBaseline {
  mmdsByComponent?: Record<string, number>;
  deprecatedByComponent?: Record<string, number>;
}

function diffComponentCounts(
  from: Record<string, number> | undefined,
  to: Record<string, number> | undefined,
  direction: 'increased' | 'decreased',
): ComponentDelta[] {
  if (!from || !to) return [];
  const names = new Set([...Object.keys(from), ...Object.keys(to)]);
  const deltas: ComponentDelta[] = [];
  for (const component of names) {
    const prev = from[component] ?? 0;
    const next = to[component] ?? 0;
    const delta = next - prev;
    if (direction === 'increased' && delta > 0) {
      deltas.push({ component, delta, from: prev, to: next });
    } else if (direction === 'decreased' && delta < 0) {
      deltas.push({ component, delta, from: prev, to: next });
    }
  }
  return deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function ComponentDeltaList({
  title,
  items,
  valueClassName,
}: {
  title: string;
  items: ComponentDelta[];
  valueClassName: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-gray-500 dark:text-gray-400 mb-0.5">
        {title} ({items.length}):
      </p>
      <ul className="space-y-0.5 max-h-36 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.component}
            className="flex justify-between gap-3 text-gray-700 dark:text-gray-200"
          >
            <span className="font-mono truncate">{item.component}</span>
            <span className={`tabular-nums shrink-0 ${valueClassName}`}>
              {item.delta > 0 ? '+' : ''}{item.delta}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Delta computation ────────────────────────────────────────────────────────

interface DeltaInfo {
  delta: number | null;
  mmdsInstanceDelta: number | null;
  legacyInstanceDelta: number | null;
  fromDate: string | null;
  toDate: string | null;
  actualWeeks: number;
}

function buildDeltaMap(
  timeline: CodeOwnerTimeline | undefined,
  lookback: number,
): Map<string, DeltaInfo> {
  const map = new Map<string, DeltaInfo>();
  if (!timeline) return map;
  const { dates, owners } = timeline;
  const n = dates.length;
  if (n < 2) return map;
  const toIdx = n - 1;
  const fromIdx = Math.max(0, toIdx - lookback);
  const fromDate = dates[fromIdx] ?? null;
  const toDate = dates[toIdx] ?? null;
  const actualWeeks = toIdx - fromIdx;

  for (const [owner, data] of Object.entries(owners)) {
    const arr = data.migrationPercentage;
    const key = normalizeOwnerKey(owner);
    if (!arr || arr.length <= fromIdx) {
      map.set(key, {
        delta: null,
        mmdsInstanceDelta: null,
        legacyInstanceDelta: null,
        fromDate,
        toDate,
        actualWeeks,
      });
      continue;
    }
    const current = arr[toIdx] ?? arr[arr.length - 1];
    const past = arr[fromIdx] ?? arr[0];
    const mmdsTo = data.mmdsInstances?.[toIdx] ?? data.mmdsInstances?.[data.mmdsInstances.length - 1];
    const mmdsFrom = data.mmdsInstances?.[fromIdx] ?? data.mmdsInstances?.[0];
    const legacyTo = data.deprecatedInstances?.[toIdx] ?? data.deprecatedInstances?.[data.deprecatedInstances.length - 1];
    const legacyFrom = data.deprecatedInstances?.[fromIdx] ?? data.deprecatedInstances?.[0];
    map.set(key, {
      delta: parseFloat((current - past).toFixed(2)),
      mmdsInstanceDelta:
        mmdsTo != null && mmdsFrom != null ? mmdsTo - mmdsFrom : null,
      legacyInstanceDelta:
        legacyTo != null && legacyFrom != null ? legacyTo - legacyFrom : null,
      fromDate,
      toDate,
      actualWeeks,
    });
  }
  return map;
}

// ─── Delta SVG label rendered inside the bar chart ───────────────────────────

function DeltaLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (value == null) return null;
  const isFlat = Math.abs(value) < 0.5;
  const isPositive = value > 0;
  const color = isFlat ? '#9ca3af' : isPositive ? '#10b981' : '#ef4444';
  const text = isFlat
    ? '~flat'
    : `${isPositive ? '+' : ''}${value.toFixed(1)}pp ${isPositive ? '↑' : '↓'}`;
  return (
    <text
      x={(x ?? 0) + (width ?? 0) + 8}
      y={(y ?? 0) + (height ?? 0) / 2}
      dominantBaseline="middle"
      fontSize={10}
      fontWeight={600}
      fill={color}
    >
      {text}
    </text>
  );
}

// ─── Lookback selector ────────────────────────────────────────────────────────

const LOOKBACK_OPTIONS = [
  { label: '1 week', value: 1 },
  { label: '4 weeks', value: 4 },
  { label: '8 weeks', value: 8 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeOwnerAdoptionChart({
  codeOwnerStats,
  title,
  threshold = 90,
  codeOwnerTimeline,
  project,
}: CodeOwnerAdoptionChartProps) {
  // Default to 1 week — most actionable for spotting week-over-week changes.
  const [lookback, setLookback] = useState(1);
  const deltaMap = buildDeltaMap(codeOwnerTimeline, lookback);
  const [baselineByOwner, setBaselineByOwner] = useState<
    Record<string, OwnerComponentBaseline> | null
  >(null);

  const comparisonDates = useMemo(() => {
    if (!codeOwnerTimeline || codeOwnerTimeline.dates.length < 2) {
      return { fromDate: null as string | null, toDate: null as string | null };
    }
    const toIdx = codeOwnerTimeline.dates.length - 1;
    const fromIdx = Math.max(0, toIdx - lookback);
    return {
      fromDate: codeOwnerTimeline.dates[fromIdx] ?? null,
      toDate: codeOwnerTimeline.dates[toIdx] ?? null,
    };
  }, [codeOwnerTimeline, lookback]);

  // Load the lookback snapshot so we can diff per-component usage by team.
  useEffect(() => {
    let cancelled = false;

    async function loadBaseline() {
      if (!project || !comparisonDates.fromDate) {
        setBaselineByOwner(null);
        return;
      }

      try {
        const indexRes = await fetch(`${METRICS_PATH}index.json`);
        if (!indexRes.ok) throw new Error('Failed to fetch index');
        const index: IndexData = await indexRes.json();
        const entry = (index.projects[project] || []).find(
          (e) => e.date === comparisonDates.fromDate,
        );
        if (!entry) {
          if (!cancelled) setBaselineByOwner(null);
          return;
        }

        const dataRes = await fetch(`${METRICS_PATH}${entry.file}`);
        if (!dataRes.ok) throw new Error(`Failed to fetch ${entry.file}`);
        const metrics: MetricsData = await dataRes.json();

        const map: Record<string, OwnerComponentBaseline> = {};
        for (const [owner, stats] of Object.entries(metrics.summary.codeOwnerStats || {})) {
          if (stats.mmdsByComponent || stats.deprecatedByComponent) {
            map[normalizeOwnerKey(owner)] = {
              mmdsByComponent: stats.mmdsByComponent,
              deprecatedByComponent: stats.deprecatedByComponent,
            };
          }
        }
        if (!cancelled) {
          setBaselineByOwner(Object.keys(map).length > 0 ? map : null);
        }
      } catch {
        if (!cancelled) setBaselineByOwner(null);
      }
    }

    loadBaseline();
    return () => {
      cancelled = true;
    };
  }, [project, comparisonDates.fromDate]);

  const chartData = Object.entries(codeOwnerStats)
    .map(([owner, stats]) => {
      const key = normalizeOwnerKey(owner);
      const di = deltaMap.get(key);
      const baseline = baselineByOwner?.[key];
      return {
        ownerLabel: formatOwnerLabel(owner),
        team: formatOwnerLabel(owner),
        ownerKey: key,
        mmdsInstances: stats.mmdsInstances,
        deprecatedInstances: stats.deprecatedInstances,
        migrationPercentage: parseFloat(stats.migrationPercentage),
        totalInstances: stats.totalInstances,
        delta4w: di?.delta ?? null,
        mmdsInstanceDelta: di?.mmdsInstanceDelta ?? null,
        legacyInstanceDelta: di?.legacyInstanceDelta ?? null,
        mmdsIncreased: diffComponentCounts(baseline?.mmdsByComponent, stats.mmdsByComponent, 'increased'),
        legacyIncreased: diffComponentCounts(baseline?.deprecatedByComponent, stats.deprecatedByComponent, 'increased'),
        legacyReduced: diffComponentCounts(baseline?.deprecatedByComponent, stats.deprecatedByComponent, 'decreased'),
        deltaFromDate: di?.fromDate ?? null,
        deltaToDate: di?.toDate ?? null,
        actualWeeks: di?.actualWeeks ?? lookback,
      };
    })
    .sort((a, b) => b.migrationPercentage - a.migrationPercentage);

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400">No code owner data available</p>
      </div>
    );
  }

  const compliant = chartData.filter(d => d.migrationPercentage >= threshold).length;
  const total = chartData.length;
  const pctCompliant = Math.round((compliant / total) * 100);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const onTarget = d.migrationPercentage >= threshold;
    const hasDelta = d.delta4w != null;
    const isFlat = hasDelta && Math.abs(d.delta4w) < 0.5;
    const isDeclining = hasDelta && !isFlat && d.delta4w < 0;
    const isImproving = hasDelta && !isFlat && d.delta4w > 0;
    const mmdsColor = barFill(d.migrationPercentage, threshold);
    const mmdsIncreased: ComponentDelta[] = d.mmdsIncreased ?? [];
    const legacyIncreased: ComponentDelta[] = d.legacyIncreased ?? [];
    const legacyReduced: ComponentDelta[] = d.legacyReduced ?? [];
    const mmdsDelta: number | null = d.mmdsInstanceDelta;
    const legacyDelta: number | null = d.legacyInstanceDelta;
    const hasComponentBreakdown =
      mmdsIncreased.length > 0 || legacyIncreased.length > 0 || legacyReduced.length > 0;
    const showPeriodDetail = (isDeclining || isImproving) && (
      mmdsDelta != null || legacyDelta != null || hasComponentBreakdown
    );

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm min-w-[220px] max-w-[320px]">
        <p className="font-semibold text-gray-900 dark:text-white mb-1">{d.ownerLabel}</p>
        <TooltipMetricRow
          color={mmdsColor}
          label="MMDS"
          value={d.mmdsInstances.toLocaleString()}
        />
        <TooltipMetricRow
          swatchClassName="bg-gray-200 dark:bg-gray-600"
          labelClassName="text-gray-600 dark:text-gray-400"
          label="Legacy"
          value={d.deprecatedInstances.toLocaleString()}
        />
        <p className={`mt-1 font-semibold ${onTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          Adoption: {d.migrationPercentage.toFixed(1)}%
          {onTarget ? ' ✓' : ` (${(threshold - d.migrationPercentage).toFixed(1)}pp to go)`}
        </p>
        {hasDelta && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs space-y-1">
            <p className="text-gray-400 dark:text-gray-500">
              {d.deltaFromDate} → {d.deltaToDate}
            </p>
            <p className={`font-semibold ${
              isFlat
                ? 'text-gray-400 dark:text-gray-500'
                : isImproving
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400'
            }`}>
              {isFlat
                ? 'No meaningful change (~flat)'
                : `${d.delta4w > 0 ? '+' : ''}${d.delta4w.toFixed(1)}pp ${isImproving ? '↑ improving' : '↓ declining'}`}
            </p>
            {showPeriodDetail && (
              <div className="pt-1 space-y-1.5">
                {mmdsDelta != null && mmdsDelta !== 0 && (
                  <p className={mmdsDelta > 0 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-500 dark:text-red-400 font-medium'}>
                    MMDS instances: {mmdsDelta > 0 ? '+' : ''}{mmdsDelta.toLocaleString()}
                  </p>
                )}
                {legacyDelta != null && legacyDelta !== 0 && (
                  <p className={legacyDelta > 0 ? 'text-red-500 dark:text-red-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                    Legacy instances: {legacyDelta > 0 ? '+' : ''}{legacyDelta.toLocaleString()}
                  </p>
                )}
                {hasComponentBreakdown ? (
                  <>
                    <ComponentDeltaList
                      title="MMDS components increased"
                      items={mmdsIncreased}
                      valueClassName="text-emerald-600 dark:text-emerald-400"
                    />
                    <ComponentDeltaList
                      title="Legacy components reduced"
                      items={legacyReduced}
                      valueClassName="text-emerald-600 dark:text-emerald-400"
                    />
                    <ComponentDeltaList
                      title="Legacy components introduced / increased"
                      items={legacyIncreased}
                      valueClassName="text-red-500 dark:text-red-400"
                    />
                  </>
                ) : (
                  ((isImproving && mmdsDelta != null && mmdsDelta > 0) ||
                    (isDeclining && legacyDelta != null && legacyDelta > 0)) && (
                    <p className="text-gray-400 dark:text-gray-500">
                      Component breakdown unavailable for this comparison window.
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {codeOwnerTimeline && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Δ labels show change vs {lookback} week{lookback !== 1 ? 's' : ''} ago
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Lookback selector */}
          {codeOwnerTimeline && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span>Compare:</span>
              <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-600 text-xs">
                {LOOKBACK_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLookback(opt.value)}
                    className={`px-2.5 py-1 transition-colors ${
                      lookback === opt.value
                        ? 'bg-blue-600 text-white font-medium'
                        : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Compliance cards */}
          <div className="flex gap-3">
            <div className={`rounded-lg px-4 py-2.5 text-center min-w-[120px] ${
              compliant === total
                ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-200 dark:ring-emerald-700'
                : 'bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-700'
            }`}>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                ≥ {threshold}% target
              </p>
              <p className={`text-2xl font-bold ${
                compliant === total ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}>
                {compliant} <span className="text-base font-normal text-gray-400">/ {total}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">teams on target</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 text-center min-w-[90px] bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Below</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{total - compliant}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">teams ({100 - pctCompliant}%)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
          <span className="text-gray-500 dark:text-gray-400">≥ {threshold}% (on target)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-400" />
          <span className="text-gray-500 dark:text-gray-400">≥ {Math.round(threshold * 0.7)}% (approaching)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-400" />
          <span className="text-gray-500 dark:text-gray-400">&lt; {Math.round(threshold * 0.7)}% (behind)</span>
        </span>
        {codeOwnerTimeline && (
          <>
            <span className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200 dark:border-gray-600">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">+pp ↑</span>
              <span className="text-gray-500 dark:text-gray-400">improving</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-red-500 dark:text-red-400">−pp ↓</span>
              <span className="text-gray-500 dark:text-gray-400">declining</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-400">~flat</span>
              <span className="text-gray-500 dark:text-gray-400">no change</span>
            </span>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={Math.max(360, chartData.length * 36)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 110, left: 100, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            dataKey="team"
            type="category"
            width={90}
            tick={{ fontSize: 11, fill: 'currentColor' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine x={0} stroke="transparent" label="" />

          <Bar dataKey="mmdsInstances" name="MMDS" stackId="a" radius={[0, 0, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={barFill(entry.migrationPercentage, threshold)} opacity={0.85} />
            ))}
          </Bar>
          <Bar dataKey="deprecatedInstances" name="Legacy" stackId="a" fill={LEGACY_BAR_FILL} radius={[0, 2, 2, 0]}>
            {chartData.map((_entry, i) => (
              <Cell key={i} fill={LEGACY_BAR_FILL} className="dark:fill-gray-600" opacity={0.7} />
            ))}
            {codeOwnerTimeline && (
              <LabelList dataKey="delta4w" content={DeltaLabel} />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
