interface MetricsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string | number;
    isPositive: boolean;
  };
  newComponents?: string[];
  className?: string;
}

export function MetricsCard({
  title,
  value,
  subtitle,
  trend,
  newComponents,
  className = "",
}: MetricsCardProps) {
  console.log("newComponents", newComponents);
  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${className}`}
    >
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
              trend.isPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {trend.isPositive ? "+" : ""}
            {trend.value}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {subtitle}
        </p>
      )}
      {newComponents && newComponents.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
            New components:
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {newComponents.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
