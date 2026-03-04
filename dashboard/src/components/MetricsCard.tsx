interface MetricsCardProps {
  project: 'mobile' | 'extension';
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

function getMetricTooltip(title: string, project: 'mobile' | 'extension') {
  const packageName =
    project === 'mobile'
      ? '@metamask/design-system-react-native'
      : '@metamask/design-system-react';
  const repoLabel = project === 'mobile' ? 'mobile' : 'extension';
  const deprecatedPath =
    project === 'mobile'
      ? 'app/component-library/'
      : 'ui/components/component-library/';

  const tooltips: Record<string, string> = {
    'MMDS Components': `Count of components available from ${packageName}.`,
    'MMDS Instances': `Count of ${packageName} component instances used in the ${repoLabel} codebase.`,
    'Deprecated Components': `Count of components in ${deprecatedPath} marked with @deprecated JSDoc.`,
    'Deprecated Instances': `Count of instances in the ${repoLabel} codebase that still use deprecated imports from ${deprecatedPath}.`,
    'Migration Progress': `Adoption rate = MMDS Instances / (MMDS Instances + Deprecated Instances) for the ${repoLabel} codebase.`,
  };

  return tooltips[title];
}

export function MetricsCard({
  project,
  title,
  value,
  subtitle,
  trend,
  newComponents,
  className = "",
}: MetricsCardProps) {
  const tooltip = getMetricTooltip(title, project);

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow p-6 ${className}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {title}
        </h3>
        {tooltip && (
          <div className="relative group">
            <button
              type="button"
              aria-label={`More info about ${title}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-[10px] font-semibold text-gray-500 dark:border-gray-500 dark:text-gray-300"
            >
              i
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md bg-gray-900 p-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-gray-700">
              {tooltip}
            </div>
          </div>
        )}
      </div>
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
