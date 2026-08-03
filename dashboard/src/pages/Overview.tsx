import { useTimelineData, useMetricsData, useMigrationTargets } from '../hooks/useMetricsData';
import type { MigrationTargetsProject, ProjectTimeline } from '../types/metrics';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { MetricsCard } from '../components/MetricsCard';
import { CodeOwnerAdoptionChart } from '../components/CodeOwnerAdoptionChart';
import { CodeOwnerTrendChart } from '../components/CodeOwnerTrendChart';
import { CodeOwnerAdoptionTrendChart } from '../components/CodeOwnerAdoptionTrendChart';
import { ComponentPropsAuditSection } from '../components/ComponentPropsAuditSection';
import { TeamLegacyBacklog } from '../components/TeamLegacyBacklog';
import {
  EXTENSION_EXCLUDED_OWNERS,
  MOBILE_EXCLUDED_OWNERS,
  normalizeOwner,
} from '../constants/codeOwners';
import type { CodeOwnerStats } from '../types/metrics';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

// ─── Deprecated instances weekly-delta sparkline ──────────────────────────────

function DeprecatedDeltaSparkline({ timeline, project }: { timeline: ProjectTimeline; project: string }) {
  const deltas = timeline.deprecatedInstances.map((v, i) =>
    i === 0 ? 0 : v - timeline.deprecatedInstances[i - 1],
  ).slice(1); // drop the first zero

  const dates = timeline.dates.slice(1);

  const chartData = deltas.map((delta, i) => ({ date: dates[i], delta }));

  if (chartData.length === 0) return null;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const isGood = d.delta < 0;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow p-2.5 text-xs">
        <p className="text-gray-500 dark:text-gray-400 mb-0.5">{d.date}</p>
        <p className={`font-semibold ${isGood ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          {d.delta > 0 ? `+${d.delta}` : d.delta} deprecated instances
        </p>
        <p className="text-gray-400 dark:text-gray-500 mt-0.5">
          {isGood ? 'Week-over-week reduction' : d.delta === 0 ? 'No change' : 'Net increase — new deprecated usage added'}
        </p>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            {project === 'mobile' ? '📱' : '🧩'} Deprecated instances — weekly change
          </h4>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Green bars = net reduction (good). Red bars = net increase (new deprecated usage added).
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500" />reduction</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-400" />increase</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-700" />
          <XAxis dataKey="date" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={36} />
          <YAxis tick={{ fontSize: 10 }} width={36} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          <Bar dataKey="delta" radius={[2, 2, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.delta < 0 ? '#10b981' : entry.delta === 0 ? '#d1d5db' : '#f87171'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const JIRA_BROWSE_BASE = 'https://consensyssoftware.atlassian.net/browse';

function normalizeTargetEntries(projectTargets?: MigrationTargetsProject | null) {
  return (projectTargets?.components || [])
    .map((entry) => {
      if (typeof entry === 'string') {
        return { name: entry, status: 'to_do' as const };
      }

      return {
        name: entry?.name,
        status: entry?.status || 'to_do',
      };
    })
    .filter((entry) => typeof entry.name === 'string' && entry.name.length > 0);
}

const EXCLUDED_STATUSES = new Set(['not_doing', 'cancelled']);

function getPlannedTargetCount(projectTargets?: MigrationTargetsProject | null) {
  const entries = normalizeTargetEntries(projectTargets);
  return entries.filter((entry) => !EXCLUDED_STATUSES.has(entry.status ?? '')).length;
}

function getMigratedTargetCount(projectTargets?: MigrationTargetsProject | null) {
  const entries = normalizeTargetEntries(projectTargets);
  return entries.filter((entry) => entry.status === 'complete').length;
}

function filterCodeOwners(
  codeOwnerStats: Record<string, CodeOwnerStats> | undefined,
  excludedOwners: Set<string>,
): Record<string, CodeOwnerStats> | undefined {
  if (!codeOwnerStats) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(codeOwnerStats).filter(([owner, stats]) => {
      if (excludedOwners.has(normalizeOwner(owner))) {
        return false;
      }

      // Remove CODEOWNERS entries that have no tracked footprint in current metrics.
      return stats.totalInstances > 0 || stats.filesCount > 0;
    }),
  );
}

export function Overview() {
  const { data, loading, error } = useTimelineData();
  const { data: mobileMetrics } = useMetricsData('mobile');
  const { data: extensionMetrics } = useMetricsData('extension');
  const { data: migrationTargets } = useMigrationTargets();

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  // Get latest metrics
  const mobileLatest = data.mobile.dates.length > 0
    ? {
        date: data.mobile.dates[data.mobile.dates.length - 1],
        migration: data.mobile.migrationPercentage[data.mobile.migrationPercentage.length - 1],
        mmds: data.mobile.mmdsInstances[data.mobile.mmdsInstances.length - 1],
        deprecated: data.mobile.deprecatedInstances[data.mobile.deprecatedInstances.length - 1],
        components: data.mobile.totalComponents[data.mobile.totalComponents.length - 1],
        mmdsComponentsAvailable: data.mobile.mmdsComponentsAvailable?.[data.mobile.mmdsComponentsAvailable.length - 1] || 0,
        newComponents: data.mobile.newComponents?.[data.mobile.newComponents.length - 1] || [],
      }
    : null;

  const extensionLatest = data.extension.dates.length > 0
    ? {
        date: data.extension.dates[data.extension.dates.length - 1],
        migration: data.extension.migrationPercentage[data.extension.migrationPercentage.length - 1],
        mmds: data.extension.mmdsInstances[data.extension.mmdsInstances.length - 1],
        deprecated: data.extension.deprecatedInstances[data.extension.deprecatedInstances.length - 1],
        components: data.extension.totalComponents[data.extension.totalComponents.length - 1],
        mmdsComponentsAvailable: data.extension.mmdsComponentsAvailable?.[data.extension.mmdsComponentsAvailable.length - 1] || 0,
        newComponents: data.extension.newComponents?.[data.extension.newComponents.length - 1] || [],
      }
    : null;

  // Prepare chart data - show all 26 weeks of historical data
  const mobileChartData = data.mobile.dates.map((date, i) => ({
    date,
    mmdsComponents: data.mobile.mmdsComponentsAvailable?.[i] || 0,
    mmdsInstances: data.mobile.mmdsInstances[i],
    deprecatedInstances: data.mobile.deprecatedInstances[i],
    totalInstances: data.mobile.mmdsInstances[i] + data.mobile.deprecatedInstances[i],
    migration: data.mobile.migrationPercentage[i],
  }));

  const extensionChartData = data.extension.dates.map((date, i) => ({
    date,
    mmdsComponents: data.extension.mmdsComponentsAvailable?.[i] || 0,
    mmdsInstances: data.extension.mmdsInstances[i],
    deprecatedInstances: data.extension.deprecatedInstances[i],
    totalInstances: data.extension.mmdsInstances[i] + data.extension.deprecatedInstances[i],
    migration: data.extension.migrationPercentage[i],
  }));

  const mobileCodeOwnerStats = filterCodeOwners(
    mobileMetrics?.summary.codeOwnerStats,
    MOBILE_EXCLUDED_OWNERS,
  );
  const extensionCodeOwnerStats = filterCodeOwners(
    extensionMetrics?.summary.codeOwnerStats,
    EXTENSION_EXCLUDED_OWNERS,
  );

  const mobilePlannedTargets = getPlannedTargetCount(migrationTargets?.mobile);
  const extensionPlannedTargets = getPlannedTargetCount(migrationTargets?.extension);
  const mobileMigratedTargets = getMigratedTargetCount(migrationTargets?.mobile);
  const extensionMigratedTargets = getMigratedTargetCount(migrationTargets?.extension);

  const mobileMigratedPercent = mobilePlannedTargets > 0
    ? Math.round((mobileMigratedTargets / mobilePlannedTargets) * 100)
    : 0;
  const extensionMigratedPercent = extensionPlannedTargets > 0
    ? Math.round((extensionMigratedTargets / extensionPlannedTargets) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Design System Migration Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Tracking component migration from legacy libraries to MetaMask Design System (MMDS)
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Last updated: {new Date(data.generatedAt).toLocaleDateString()}
          </p>
        </header>

        {/* Mobile Metrics */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Mobile</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <MetricsCard
              project="mobile"
              title="MMDS Components"
              value={mobileLatest?.mmdsComponentsAvailable || 0}
              subtitle={
                mobilePlannedTargets > 0 && migrationTargets?.mobile?.source && mobileLatest ? (
                  <div className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                    <a
                      href={`${JIRA_BROWSE_BASE}/${migrationTargets.mobile.source}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                      title="Components migrated from the legacy Mobile component library to MMDS"
                    >
                      {`${mobileMigratedTargets}/${mobilePlannedTargets} (${mobileMigratedPercent}%) migrated`}
                    </a>
                    <p className="text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                      Legacy component library → MMDS
                    </p>
                  </div>
                ) : (
                  <p>Components available in package</p>
                )
              }
              newComponents={mobileLatest?.newComponents}
              trend={
                data.mobile.latestChange
                  ? {
                      value: data.mobile.latestChange.mmdsComponentsAvailableChange,
                      isPositive: data.mobile.latestChange.mmdsComponentsAvailableChange > 0,
                    }
                  : undefined
              }
            />
            <MetricsCard
              project="mobile"
              title="MMDS Instances"
              value={mobileLatest?.mmds.toLocaleString() || 0}
              subtitle="Components from MMDS package"
              trend={
                data.mobile.latestChange
                  ? {
                      value: data.mobile.latestChange.mmdsInstancesChange,
                      isPositive: data.mobile.latestChange.mmdsInstancesChange > 0,
                    }
                  : undefined
              }
            />
            <MetricsCard
              project="mobile"
              title="Deprecated Components"
              value={mobileLatest?.components || 0}
              subtitle="Legacy components being tracked"
            />
            <MetricsCard
              project="mobile"
              title="Deprecated Instances"
              value={mobileLatest?.deprecated.toLocaleString() || 0}
              subtitle="Legacy components remaining"
              trend={
                data.mobile.latestChange
                  ? {
                      value: data.mobile.latestChange.deprecatedInstancesChange,
                      isPositive: data.mobile.latestChange.deprecatedInstancesChange < 0,
                    }
                  : undefined
              }
            />
            <MetricsCard
              project="mobile"
              title="Migration Progress"
              value={`${mobileLatest?.migration.toFixed(2)}%`}
              trend={
                data.mobile.latestChange
                  ? {
                      value: `${data.mobile.latestChange.migrationPercentageChange}%`,
                      isPositive: parseFloat(data.mobile.latestChange.migrationPercentageChange) > 0,
                    }
                  : undefined
              }
            />
          </div>

          {/* Mobile Trend Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              6 Month Trend
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={mobileChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  yAxisId="left"
                  label={{ value: 'Component Instances', angle: -90, position: 'insideLeft' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'Migration % / Components', angle: 90, position: 'insideRight' }}
                  domain={[0, 100]}
                />
                <Tooltip labelStyle={{ color: '#111827' }} />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="mmdsInstances"
                  name="MMDS Instances"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="deprecatedInstances"
                  name="Deprecated Instances"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="totalInstances"
                  name="Total DS Instances"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="mmdsComponents"
                  name="MMDS Components Available"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="migration"
                  name="Migration %"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Disclaimer: Deprecated here mostly means older-generation design system components,
            not inherently bad code. Many of these components were the latest standard when they
            were introduced. The deprecated instances line can increase even during healthy
            progress because newly released MMDS replacements often add new
            <code> @deprecated</code> tags to legacy components. The long-term target is MMDS
            growth with deprecated usage eventually peaking and then declining.
          </p>

          <DeprecatedDeltaSparkline timeline={data.mobile} project="mobile" />

          {mobileCodeOwnerStats && Object.keys(mobileCodeOwnerStats).length > 0 && (
            <div className="mt-6">
              <CodeOwnerAdoptionChart
                codeOwnerStats={mobileCodeOwnerStats}
                title="Mobile - Code Owner Adoption"
                threshold={90}
                codeOwnerTimeline={data.mobile.codeOwnerTimeline}
                project="mobile"
              />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                Disclaimer: Code owner adoption reflects migration stage, not code quality.
                Higher deprecated counts often indicate older feature code built with components
                that were current at the time and were later deprecated. Those areas are then
                updated during planned replacement phases as MMDS alternatives roll out.
              </p>
            </div>
          )}

          {mobileCodeOwnerStats && (
            <TeamLegacyBacklog
              title="Mobile — Remaining legacy by team"
              project="mobile"
              codeOwnerStats={mobileCodeOwnerStats}
              components={mobileMetrics?.components}
              excludedOwners={MOBILE_EXCLUDED_OWNERS}
            />
          )}

          {data.mobile.codeOwnerTimeline && data.mobile.codeOwnerTimeline.dates.length > 0 && (
            <>
              <div className="mt-6">
                <CodeOwnerTrendChart
                  codeOwnerTimeline={data.mobile.codeOwnerTimeline}
                  title="Mobile - Code Owner Migration Trend"
                  excludedOwners={MOBILE_EXCLUDED_OWNERS}
                />
              </div>
              <div className="mt-6">
                <CodeOwnerAdoptionTrendChart
                  codeOwnerTimeline={data.mobile.codeOwnerTimeline}
                  title="Mobile - Team DS Adoption Trend"
                  excludedOwners={MOBILE_EXCLUDED_OWNERS}
                />
              </div>
            </>
          )}
        </section>

        {/* Extension Metrics */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Extension</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <MetricsCard
              project="extension"
              title="MMDS Components"
              value={extensionLatest?.mmdsComponentsAvailable || 0}
              subtitle={
                extensionPlannedTargets > 0 && migrationTargets?.extension?.source && extensionLatest ? (
                  <div className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">
                    <a
                      href={`${JIRA_BROWSE_BASE}/${migrationTargets.extension.source}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                      title="Components migrated from the legacy Extension component library to MMDS"
                    >
                      {`${extensionMigratedTargets}/${extensionPlannedTargets} (${extensionMigratedPercent}%) migrated`}
                    </a>
                    <p className="text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                      Legacy component library → MMDS
                    </p>
                  </div>
                ) : (
                  <p>Components available in package</p>
                )
              }
              newComponents={extensionLatest?.newComponents}
              trend={
                data.extension.latestChange
                  ? {
                      value: data.extension.latestChange.mmdsComponentsAvailableChange,
                      isPositive: data.extension.latestChange.mmdsComponentsAvailableChange > 0,
                    }
                  : undefined
              }
            />
            <MetricsCard
              project="extension"
              title="MMDS Instances"
              value={extensionLatest?.mmds.toLocaleString() || 0}
              subtitle="Components from MMDS package"
              trend={
                data.extension.latestChange
                  ? {
                      value: data.extension.latestChange.mmdsInstancesChange,
                      isPositive: data.extension.latestChange.mmdsInstancesChange > 0,
                    }
                  : undefined
              }
            />
            <MetricsCard
              project="extension"
              title="Deprecated Components"
              value={extensionLatest?.components || 0}
              subtitle="Legacy components being tracked"
            />
            <MetricsCard
              project="extension"
              title="Deprecated Instances"
              value={extensionLatest?.deprecated.toLocaleString() || 0}
              subtitle="Legacy components remaining"
              trend={
                data.extension.latestChange
                  ? {
                      value: data.extension.latestChange.deprecatedInstancesChange,
                      isPositive: data.extension.latestChange.deprecatedInstancesChange < 0,
                    }
                  : undefined
              }
            />
            <MetricsCard
              project="extension"
              title="Migration Progress"
              value={`${extensionLatest?.migration.toFixed(2)}%`}
              trend={
                data.extension.latestChange
                  ? {
                      value: `${data.extension.latestChange.migrationPercentageChange}%`,
                      isPositive: parseFloat(data.extension.latestChange.migrationPercentageChange) > 0,
                    }
                  : undefined
              }
            />
          </div>

          {/* Extension Trend Chart */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              6 Month Trend
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={extensionChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  yAxisId="left"
                  label={{ value: 'Component Instances', angle: -90, position: 'insideLeft' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'Migration % / Components', angle: 90, position: 'insideRight' }}
                  domain={[0, 100]}
                />
                <Tooltip labelStyle={{ color: '#111827' }} />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="mmdsInstances"
                  name="MMDS Instances"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="deprecatedInstances"
                  name="Deprecated Instances"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="totalInstances"
                  name="Total DS Instances"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="mmdsComponents"
                  name="MMDS Components Available"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="migration"
                  name="Migration %"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Disclaimer: Deprecated here mostly means older-generation design system components,
            not inherently bad code. Many of these components were the latest standard when they
            were introduced. The deprecated instances line can increase even during healthy
            progress because newly released MMDS replacements often add new
            <code> @deprecated</code> tags to legacy components. The long-term target is MMDS
            growth with deprecated usage eventually peaking and then declining.
          </p>

          <DeprecatedDeltaSparkline timeline={data.extension} project="extension" />

          {extensionCodeOwnerStats && Object.keys(extensionCodeOwnerStats).length > 0 && (
            <div className="mt-6">
              <CodeOwnerAdoptionChart
                codeOwnerStats={extensionCodeOwnerStats}
                title="Extension - Code Owner Adoption"
                threshold={90}
                codeOwnerTimeline={data.extension.codeOwnerTimeline}
                project="extension"
              />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                Disclaimer: Code owner adoption reflects migration stage, not code quality.
                Higher deprecated counts often indicate older feature code built with components
                that were current at the time and were later deprecated. Those areas are then
                updated during planned replacement phases as MMDS alternatives roll out.
              </p>
            </div>
          )}

          {extensionCodeOwnerStats && (
            <TeamLegacyBacklog
              title="Extension — Remaining legacy by team"
              project="extension"
              codeOwnerStats={extensionCodeOwnerStats}
              components={extensionMetrics?.components}
              excludedOwners={EXTENSION_EXCLUDED_OWNERS}
            />
          )}

          {data.extension.codeOwnerTimeline && data.extension.codeOwnerTimeline.dates.length > 0 && (
            <>
              <div className="mt-6">
                <CodeOwnerTrendChart
                  codeOwnerTimeline={data.extension.codeOwnerTimeline}
                  title="Extension - Code Owner Migration Trend"
                  excludedOwners={EXTENSION_EXCLUDED_OWNERS}
                />
              </div>
              <div className="mt-6">
                <CodeOwnerAdoptionTrendChart
                  codeOwnerTimeline={data.extension.codeOwnerTimeline}
                  title="Extension - Team DS Adoption Trend"
                  excludedOwners={EXTENSION_EXCLUDED_OWNERS}
                />
              </div>
            </>
          )}
        </section>

        <ComponentPropsAuditSection />
      </div>
    </div>
  );
}
