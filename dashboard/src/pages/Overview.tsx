import { useTimelineData, useMetricsData } from '../hooks/useMetricsData';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { MetricsCard } from '../components/MetricsCard';
import { CodeOwnerAdoptionChart } from '../components/CodeOwnerAdoptionChart';
import { ComponentPropsAuditSection } from '../components/ComponentPropsAuditSection';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MOBILE_EXCLUDED_OWNERS = new Set([
  'design-system-engineers',
  'mobile-admins',
  'supply-chain',
  'qa',
]);

const EXTENSION_EXCLUDED_OWNERS = new Set([
  'howardbraham',
  'dbrans',
  'qa',
  'wallet-integrations',
  'extension-platform',
  'extension-privacy-reviewers',
  'extension-security-team',
  'policy-reviewers',
  'design-system-engineers',
]);

function normalizeOwner(owner: string) {
  return owner.replace('@MetaMask/', '').replace(/^@/, '').toLowerCase();
}

function filterCodeOwners(
  codeOwnerStats: Record<string, {
    mmdsInstances: number;
    deprecatedInstances: number;
    totalInstances: number;
    migrationPercentage: string;
    filesCount: number;
  }> | undefined,
  excludedOwners: Set<string>,
) {
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
    migration: data.mobile.migrationPercentage[i],
  }));

  const extensionChartData = data.extension.dates.map((date, i) => ({
    date,
    mmdsComponents: data.extension.mmdsComponentsAvailable?.[i] || 0,
    mmdsInstances: data.extension.mmdsInstances[i],
    deprecatedInstances: data.extension.deprecatedInstances[i],
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
              subtitle="Components available in package"
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

          {mobileCodeOwnerStats && Object.keys(mobileCodeOwnerStats).length > 0 && (
            <div className="mt-6">
              <CodeOwnerAdoptionChart
                codeOwnerStats={mobileCodeOwnerStats}
                title="Mobile - Code Owner Adoption"
              />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                Disclaimer: Code owner adoption reflects migration stage, not code quality.
                Higher deprecated counts often indicate older feature code built with components
                that were current at the time and were later deprecated. Those areas are then
                updated during planned replacement phases as MMDS alternatives roll out.
              </p>
            </div>
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
              subtitle="Components available in package"
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

          {extensionCodeOwnerStats && Object.keys(extensionCodeOwnerStats).length > 0 && (
            <div className="mt-6">
              <CodeOwnerAdoptionChart
                codeOwnerStats={extensionCodeOwnerStats}
                title="Extension - Code Owner Adoption"
              />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                Disclaimer: Code owner adoption reflects migration stage, not code quality.
                Higher deprecated counts often indicate older feature code built with components
                that were current at the time and were later deprecated. Those areas are then
                updated during planned replacement phases as MMDS alternatives roll out.
              </p>
            </div>
          )}
        </section>

        <ComponentPropsAuditSection />
      </div>
    </div>
  );
}
