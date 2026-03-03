import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CodeOwnerStats {
  mmdsInstances: number;
  deprecatedInstances: number;
  totalInstances: number;
  migrationPercentage: string;
  filesCount: number;
}

interface CodeOwnerAdoptionChartProps {
  codeOwnerStats: Record<string, CodeOwnerStats>;
  title: string;
}

export function CodeOwnerAdoptionChart({ codeOwnerStats, title }: CodeOwnerAdoptionChartProps) {
  // Transform data for chart
  const chartData = Object.entries(codeOwnerStats)
    .map(([owner, stats]) => ({
      owner,
      team: owner.replace('@MetaMask/', '').replace(/^@/, ''),
      'MMDS Components': stats.mmdsInstances,
      'Deprecated Components': stats.deprecatedInstances,
      migrationPercentage: parseFloat(stats.migrationPercentage),
      totalInstances: stats.totalInstances
    }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {title}
        </h3>
        <p className="text-gray-500 dark:text-gray-400">No code owner data available</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">{data.owner}</p>
          <p className="text-sm text-blue-600 dark:text-blue-400">
            MMDS: {data['MMDS Components'].toLocaleString()}
          </p>
          <p className="text-sm text-orange-600 dark:text-orange-400">
            Deprecated: {data['Deprecated Components'].toLocaleString()}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Migration: {data.migrationPercentage.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(400, chartData.length * 36)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-600" />
          <XAxis type="number" className="text-xs" />
          <YAxis
            dataKey="team"
            type="category"
            width={90}
            className="text-xs"
            tick={{ fill: 'currentColor' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="MMDS Components" stackId="a" fill="#3b82f6" />
          <Bar dataKey="Deprecated Components" stackId="a" fill="#f97316" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
