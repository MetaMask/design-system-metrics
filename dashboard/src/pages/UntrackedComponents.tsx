import { useUntrackedData } from '../hooks/useMetricsData';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import type { UntrackedData, UntrackedComponent } from '../types/metrics';

function confidenceBadge(confidence: 'exact' | 'high' | 'medium') {
  const styles: Record<string, string> = {
    exact: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    high: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    medium: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[confidence]}`}>
      {confidence}
    </span>
  );
}

function firstNonLocalSource(sources: string[]): string {
  const external = sources.find(
    (s) => !s.startsWith('.') && !s.startsWith('/'),
  );
  return external ?? sources[0] ?? '—';
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string | number; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
        {title}
      </h3>
      <p className="text-3xl font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{subtitle}</p>
    </div>
  );
}

function ReplaceableTable({ rows }: { rows: UntrackedComponent[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-6 pb-0">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Potential MMDS Replacements
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              {['#', 'Component', 'Instances', 'Files', 'Best MMDS Match', 'Confidence', 'Import Source'].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row, i) => (
              <tr
                key={row.component}
                className={`${i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-gray-100 dark:hover:bg-gray-700/50`}
              >
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.component}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.instances.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.fileCount}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {row.mmdsMatches[0]?.component ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {row.mmdsMatches[0] ? confidenceBadge(row.mmdsMatches[0].confidence) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                  {firstNonLocalSource(row.importSources)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No replaceable components found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CandidatesTable({ rows }: { rows: UntrackedComponent[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-6 pb-0">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Future DS Candidates
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              {['#', 'Component', 'Instances', 'Files', 'Import Source'].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row, i) => (
              <tr
                key={row.component}
                className={`${i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-gray-100 dark:hover:bg-gray-700/50`}
              >
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{i + 1}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.component}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.instances.toLocaleString()}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.fileCount}</td>
                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                  {firstNonLocalSource(row.importSources)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No future DS candidates found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectSection({ data }: { data: UntrackedData }) {
  const coverageGap =
    data.summary.totalJSXUsages > 0
      ? ((data.summary.untrackedTotal / data.summary.totalJSXUsages) * 100).toFixed(1)
      : '0.0';

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 capitalize">
        {data.project}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Untracked Instances"
          value={data.summary.untrackedTotal.toLocaleString()}
          subtitle="JSX usages not tracked by metrics"
        />
        <SummaryCard
          title="Potential Replacements"
          value={data.summary.replaceableNow}
          subtitle="Components with MMDS matches"
        />
        <SummaryCard
          title="Future DS Candidates"
          value={data.summary.futureDSCandidates}
          subtitle="No current MMDS equivalent"
        />
        <SummaryCard
          title="Coverage Gap"
          value={`${coverageGap}%`}
          subtitle="Percentage of JSX usage untracked"
        />
      </div>

      <div className="space-y-6">
        <ReplaceableTable rows={data.replaceableWithMMDS} />
        <CandidatesTable rows={data.futureDSCandidates} />
      </div>
    </section>
  );
}

export function UntrackedComponents() {
  const { data: mobileData, loading: mobileLoading, error: mobileError } = useUntrackedData('mobile');
  const { data: extensionData, loading: extensionLoading, error: extensionError } = useUntrackedData('extension');

  const loading = mobileLoading || extensionLoading;
  const error = mobileError || extensionError;

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!mobileData && !extensionData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto text-center py-20">
          <p className="text-gray-500 dark:text-gray-400 text-lg">
            No untracked component data available yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Untracked Components
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            JSX components used in codebases but not yet tracked by migration metrics
          </p>
        </header>

        {mobileData && <ProjectSection data={mobileData} />}
        {extensionData && <ProjectSection data={extensionData} />}
      </div>
    </div>
  );
}
