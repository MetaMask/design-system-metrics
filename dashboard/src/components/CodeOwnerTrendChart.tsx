import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { CodeOwnerTimeline } from '../types/metrics';

const TEAM_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
  '#14b8a6', '#e11d48', '#0ea5e9', '#a855f7', '#d97706',
  '#059669', '#7c3aed', '#dc2626', '#2563eb', '#ca8a04',
];

function isUnknownOwner(owner: string) {
  const normalized = owner.replace(/^@/, '').toLowerCase();
  return normalized === 'unknown' || normalized === 'metamask/unknown';
}

function formatOwnerLabel(owner: string) {
  if (isUnknownOwner(owner)) {
    return 'No CODEOWNERS';
  }
  return owner.replace('@MetaMask/', '').replace(/^@/, '');
}

interface CodeOwnerTrendChartProps {
  codeOwnerTimeline: CodeOwnerTimeline;
  title: string;
  excludedOwners?: Set<string>;
}

function normalizeOwner(owner: string) {
  return owner.replace('@MetaMask/', '').replace(/^@/, '').toLowerCase();
}

export function CodeOwnerTrendChart({ codeOwnerTimeline, title, excludedOwners }: CodeOwnerTrendChartProps) {
  const { dates, owners } = codeOwnerTimeline;

  if (dates.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400">No historical code owner data available yet</p>
      </div>
    );
  }

  const activeOwners = Object.entries(owners)
    .filter(([owner, data]) => {
      if (excludedOwners?.has(normalizeOwner(owner))) return false;
      return data.totalInstances.some(v => v > 0);
    })
    .sort((a, b) => {
      const aLatest = a[1].totalInstances[a[1].totalInstances.length - 1];
      const bLatest = b[1].totalInstances[b[1].totalInstances.length - 1];
      return bLatest - aLatest;
    });

  const chartData = dates.map((date, i) => {
    const point: Record<string, string | number> = { date };
    for (const [owner, data] of activeOwners) {
      point[formatOwnerLabel(owner)] = data.migrationPercentage[i];
    }
    return point;
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const sorted = [...payload].sort((a: any, b: any) => (b.value ?? 0) - (a.value ?? 0));

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 max-h-80 overflow-y-auto">
        <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
        {sorted.map((entry: any) => (
          <p key={entry.dataKey} className="text-sm" style={{ color: entry.color }}>
            {entry.dataKey}: {entry.value?.toFixed(1)}%
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={450}>
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
            domain={[0, 100]}
            label={{ value: 'Migration %', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {activeOwners.map(([owner], i) => (
            <Line
              key={owner}
              type="monotone"
              dataKey={formatOwnerLabel(owner)}
              stroke={TEAM_COLORS[i % TEAM_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
