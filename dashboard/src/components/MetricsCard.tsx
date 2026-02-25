interface MetricsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string | number;
    isPositive: boolean;
  };
  className?: string;
}

export function MetricsCard({ title, value, subtitle, trend, className = '' }: MetricsCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${className}`}>
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
        {title}
      </h3>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold text-gray-900 dark:text-white">
          {value}
        </p>
        {trend && (
          <span
            className={`text-sm font-medium ${
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {trend.isPositive ? '+' : ''}{trend.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}
