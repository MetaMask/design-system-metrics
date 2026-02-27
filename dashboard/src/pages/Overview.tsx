import { useTimelineData } from '../hooks/useMetricsData';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { MetricsCard } from '../components/MetricsCard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function Overview() {
  const { data, loading, error } = useTimelineData();

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
      }
    : null;

  // Prepare chart data (last 12 weeks)
  const chartData = data.mobile.dates.slice(-12).map((date, i) => ({
    date,
    Mobile: data.mobile.migrationPercentage.slice(-12)[i],
    Extension: data.extension.migrationPercentage.slice(-12)[i],
  }));

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricsCard
              title="MMDS Components"
              value={mobileLatest?.mmdsComponentsAvailable || 0}
              subtitle="Components available in package"
            />
            <MetricsCard
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
              title="Deprecated Components"
              value={mobileLatest?.components || 0}
              subtitle="Legacy components being tracked"
            />
            <MetricsCard
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
        </section>

        {/* Extension Metrics */}
        <section className="mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Extension</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricsCard
              title="MMDS Components"
              value={extensionLatest?.mmdsComponentsAvailable || 0}
              subtitle="Components available in package"
            />
            <MetricsCard
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
              title="Deprecated Components"
              value={extensionLatest?.components || 0}
              subtitle="Legacy components being tracked"
            />
            <MetricsCard
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
        </section>

        {/* Trend Chart */}
        <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Migration Trend (Last 12 Weeks)
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                label={{ value: 'Migration %', angle: -90, position: 'insideLeft' }}
                domain={[0, 100]}
              />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="Mobile"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="Extension"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}
