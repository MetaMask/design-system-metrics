import { useEffect, useMemo, useState } from 'react';
import { useComponentPropsAudit, useComponentPropsAuditIndex } from '../hooks/useMetricsData';
import type { ComponentPropsAuditProject } from '../types/metrics';

function topProps(project: ComponentPropsAuditProject, limit = 10) {
  return Object.entries(project.overall.props)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);
}

function topValues(values: Record<string, number>, limit = 3) {
  return Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function ProjectAuditCard({
  projectName,
  projectData,
}: {
  projectName: string;
  projectData: ComponentPropsAuditProject;
}) {
  const propRows = topProps(projectData, 10);
  const deprecatedSources = Object.entries(projectData.deprecatedByLegacyComponent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        {projectName}
      </h4>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3">
          <p className="text-xs text-blue-700 dark:text-blue-300">MMDS Instances</p>
          <p className="text-2xl font-semibold text-blue-900 dark:text-blue-200">
            {projectData.mmds.totalInstances.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 p-3">
          <p className="text-xs text-orange-700 dark:text-orange-300">Deprecated Instances</p>
          <p className="text-2xl font-semibold text-orange-900 dark:text-orange-200">
            {projectData.deprecated.totalInstances.toLocaleString()}
          </p>
        </div>
        <div className="rounded-md bg-gray-100 dark:bg-gray-700 p-3">
          <p className="text-xs text-gray-700 dark:text-gray-300">Files With Usage</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
            {projectData.overall.filesCount.toLocaleString()}
          </p>
        </div>
      </div>

      <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
        Top Props (Overall)
      </h5>
      {propRows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No usage found for this project.</p>
      ) : (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-3">Prop</th>
                <th className="py-2 pr-3">Usage</th>
                <th className="py-2">Top Values</th>
              </tr>
            </thead>
            <tbody>
              {propRows.map(([propName, propData]) => (
                <tr key={propName} className="border-b border-gray-100 dark:border-gray-700/60">
                  <td className="py-2 pr-3 font-mono text-xs text-gray-900 dark:text-gray-100">
                    {propName}
                  </td>
                  <td className="py-2 pr-3 text-gray-800 dark:text-gray-200">
                    {propData.count.toLocaleString()}
                  </td>
                  <td className="py-2 text-xs text-gray-700 dark:text-gray-300">
                    {topValues(propData.values)
                      .map(([value, count]) => `${value} (${count})`)
                      .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deprecatedSources.length > 0 && (
        <>
          <h5 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Top Deprecated Source Components
          </h5>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {deprecatedSources.map(([name, count]) => `${name} (${count})`).join(', ')}
          </p>
        </>
      )}
    </div>
  );
}

export function ComponentPropsAuditSection() {
  const { data: auditIndex, loading: indexLoading, error: indexError } = useComponentPropsAuditIndex();
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const components = useMemo(
    () => (auditIndex?.components || []).map((entry) => entry.component),
    [auditIndex],
  );

  useEffect(() => {
    if (!selectedComponent && components.length > 0) {
      setSelectedComponent(components[0]);
    }
  }, [components, selectedComponent]);

  const {
    data: selectedAuditData,
    loading: selectedAuditLoading,
    error: selectedAuditError,
  } = useComponentPropsAudit(selectedComponent || '');

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
        Component Props Audit
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Select a component to view MMDS vs deprecated usage and prop/value patterns.
      </p>

      {indexLoading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-gray-600 dark:text-gray-300">Loading component list...</p>
        </div>
      )}

      {!indexLoading && indexError && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-red-600 dark:text-red-400">
            Failed to load component audit index: {indexError.message}
          </p>
        </div>
      )}

      {!indexLoading && !indexError && components.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <p className="text-gray-600 dark:text-gray-300">
            No component audits found yet. Start with:
          </p>
          <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-3 rounded text-gray-900 dark:text-gray-100 overflow-x-auto">
{`node scripts/component-props-audit.js --component AvatarBase --projects mobile,extension`}
          </pre>
        </div>
      )}

      {!indexLoading && !indexError && components.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {components.map((component) => (
              <button
                key={component}
                type="button"
                onClick={() => setSelectedComponent(component)}
                className={`px-3 py-1.5 rounded-md text-sm border ${
                  selectedComponent === component
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200'
                }`}
              >
                {component}
              </button>
            ))}
          </div>

          {selectedAuditLoading && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-gray-600 dark:text-gray-300">Loading {selectedComponent} audit...</p>
            </div>
          )}

          {!selectedAuditLoading && selectedAuditError && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <p className="text-red-600 dark:text-red-400">
                Failed to load {selectedComponent} audit: {selectedAuditError.message}
              </p>
            </div>
          )}

          {!selectedAuditLoading && !selectedAuditError && selectedAuditData && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {selectedAuditData.projects.mobile && (
                <ProjectAuditCard
                  projectName="Mobile"
                  projectData={selectedAuditData.projects.mobile}
                />
              )}
              {selectedAuditData.projects.extension && (
                <ProjectAuditCard
                  projectName="Extension"
                  projectData={selectedAuditData.projects.extension}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

