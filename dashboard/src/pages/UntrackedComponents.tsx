import { useMemo, useState } from 'react';
import { useUntrackedData } from '../hooks/useMetricsData';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import type { UntrackedData, UntrackedComponent } from '../types/metrics';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReplaceSortField = 'instances' | 'fileCount' | 'confidence';
type CandidateSortField = 'instances' | 'fileCount';
interface SortState<F extends string> { field: F; dir: 'asc' | 'desc' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CONFIDENCE_ORDER = { exact: 0, high: 1, medium: 2 } as const;

function mmdsComponentUrl(componentName: string, project: string): string {
  const pkg = project === 'mobile' ? 'design-system-react-native' : 'design-system-react';
  return `https://github.com/MetaMask/metamask-design-system/tree/main/packages/${pkg}/src/components/${componentName}`;
}

function sourceUrl(canonicalSource: string | undefined, importSources: string[], project: string): string | null {
  const src = canonicalSource ?? importSources[0];
  if (!src) return null;
  // Skip platform primitives / npm packages (no leading path segments that map to a repo)
  if (!src.startsWith('.') && !src.includes('/')) return null;
  const repo = project === 'mobile' ? 'metamask-mobile' : 'metamask-extension';
  const base = project === 'mobile' ? 'app' : 'ui';
  // canonicalSource has leading ../ stripped — prepend the base dir if it doesn't already start with it
  const normalised = src.startsWith(base + '/') ? src : `${base}/${src}`;
  return `https://github.com/MetaMask/${repo}/tree/main/${normalised}`;
}

function formatTeam(owner: string): string {
  return owner.replace('@MetaMask/', '').replace(/^@/, '');
}

function teamsDisplay(codeOwners: string[] | undefined): string {
  if (!codeOwners || codeOwners.length === 0) return '—';
  const names = codeOwners.filter(o => o !== '@unknown').map(formatTeam);
  if (names.length === 0) return '—';
  return names.join(', ');
}

/** Fallback for rows without canonicalSource (old JSON). */
function firstNonLocalSource(sources: string[]): string {
  const external = sources.find(s => !s.startsWith('.') && !s.startsWith('/'));
  return external ?? sources[0] ?? '—';
}

const PLATFORM_PRIMITIVE_PREFIXES = ['react-native', 'expo', 'reanimated', '@react-native', 'react-native-reanimated', 'react-native-skeleton'];

function classifySource(src: string): 'local-oneoff' | 'platform-primitive' | 'third-party' {
  if (src.startsWith('.') || src.startsWith('/')) return 'local-oneoff';
  if (PLATFORM_PRIMITIVE_PREFIXES.some(p => src === p || src.startsWith(p + '/') || src.startsWith(p + '-'))) return 'platform-primitive';
  return 'third-party';
}

/** Returns deduplicated {source, category} pairs for display in the Source cell. For mixed rows, returns one entry per distinct category using the best representative source. */
function sourceEntries(row: UntrackedComponent): { source: string; category: 'local-oneoff' | 'platform-primitive' | 'third-party' }[] {
  if (row.sourceCategory !== 'mixed') {
    const src = row.canonicalSource ?? firstNonLocalSource(row.importSources);
    const cat = (row.sourceCategory as 'local-oneoff' | 'platform-primitive' | 'third-party') ?? classifySource(src);
    return [{ source: src, category: cat }];
  }
  // For mixed: deduplicate by category, pick best representative per category.
  // canonicalSource is a normalised local path (leading ../ stripped) so it may not start
  // with '.' even though it represents a local-oneoff — use it explicitly for that category
  // when any raw importSources are relative, then skip relative sources in the loop.
  const seen = new Map<string, string>();
  const hasLocalSources = row.importSources.some(s => s.startsWith('.') || s.startsWith('/'));
  if (row.canonicalSource && hasLocalSources) {
    seen.set('local-oneoff', row.canonicalSource);
  }
  for (const src of row.importSources) {
    if (src.startsWith('.') || src.startsWith('/')) continue; // local already covered above
    const cat = classifySource(src);
    if (!seen.has(cat)) seen.set(cat, src);
  }
  // Fallback: if no local sources, classify canonicalSource normally
  if (row.canonicalSource && !hasLocalSources && !seen.size) {
    const cat = classifySource(row.canonicalSource);
    seen.set(cat, row.canonicalSource);
  }
  return Array.from(seen.entries()).map(([category, source]) => ({
    source,
    category: category as 'local-oneoff' | 'platform-primitive' | 'third-party',
  }));
}

function sortReplaceable(
  rows: UntrackedComponent[],
  sort: SortState<ReplaceSortField>,
): UntrackedComponent[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sort.field === 'instances') {
      cmp = a.instances - b.instances;
    } else if (sort.field === 'fileCount') {
      cmp = a.fileCount - b.fileCount;
    } else if (sort.field === 'confidence') {
      const aConf = CONFIDENCE_ORDER[a.mmdsMatches[0]?.confidence as keyof typeof CONFIDENCE_ORDER] ?? 3;
      const bConf = CONFIDENCE_ORDER[b.mmdsMatches[0]?.confidence as keyof typeof CONFIDENCE_ORDER] ?? 3;
      cmp = aConf - bConf; // lower = better, so desc means exact first
    }
    return sort.dir === 'desc' ? -cmp : cmp;
  });
}

function sortCandidates(
  rows: UntrackedComponent[],
  sort: SortState<CandidateSortField>,
): UntrackedComponent[] {
  return [...rows].sort((a, b) => {
    const cmp = sort.field === 'instances'
      ? a.instances - b.instances
      : a.fileCount - b.fileCount;
    return sort.dir === 'desc' ? -cmp : cmp;
  });
}

function filterRows(
  rows: UntrackedComponent[],
  teamFilter: string,
  search: string,
): UntrackedComponent[] {
  return rows
    .filter(row => !teamFilter || (row.codeOwners ?? []).includes(teamFilter))
    .filter(row => !search || row.component.toLowerCase().includes(search.toLowerCase()));
}

// ─── Badge components ─────────────────────────────────────────────────────────

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

function sourceCategoryBadge(category: string | undefined) {
  if (!category) return null;
  const styles: Record<string, string> = {
    'local-oneoff': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    'platform-primitive': 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    'third-party': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'mixed': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  };
  const labels: Record<string, string> = {
    'local-oneoff': 'one-off',
    'platform-primitive': 'primitive',
    'third-party': '3rd party',
    'mixed': 'mixed',
  };
  const style = styles[category] ?? styles['third-party'];
  const label = labels[category] ?? category;
  return (
    <span className={`inline-block shrink-0 w-fit rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function SortHeader<F extends string>({
  label,
  field,
  sortState,
  onSort,
  className = '',
}: {
  label: string;
  field: F;
  sortState: SortState<F>;
  onSort: (field: F) => void;
  className?: string;
}) {
  const isActive = sortState.field === field;
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ${className}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive
          ? <span>{sortState.dir === 'desc' ? '↓' : '↑'}</span>
          : <span className="opacity-30">↕</span>}
      </span>
    </th>
  );
}

function StaticHeader({ label, className = '' }: { label: string; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 ${className}`}>
      {label}
    </th>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ title, value, subtitle }: { title: string; value: string | number; subtitle: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{title}</h3>
      <p className="text-3xl font-semibold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{subtitle}</p>
    </div>
  );
}

// ─── Replaceable table ────────────────────────────────────────────────────────

function ReplaceableTable({
  rows,
  project,
  search,
  onSearch,
  sort,
  onSort,
}: {
  rows: UntrackedComponent[];
  project: string;
  search: string;
  onSearch: (v: string) => void;
  sort: SortState<ReplaceSortField>;
  onSort: (field: ReplaceSortField) => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-6 pb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Potential MMDS Replacements
            {rows.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({rows.length})
              </span>
            )}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Components that could switch to an MMDS equivalent today.
          </p>
        </div>
        <input
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <StaticHeader label="#" />
              <StaticHeader label="Component" />
              <SortHeader label="Instances" field="instances" sortState={sort} onSort={onSort} />
              <SortHeader label="Files" field="fileCount" sortState={sort} onSort={onSort} />
              <StaticHeader label="Best MMDS Match" />
              <SortHeader label="Confidence" field="confidence" sortState={sort} onSort={onSort} />
              <StaticHeader label="Source" />
              <StaticHeader label="Teams" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row, i) => {
              const bestMatch = row.mmdsMatches[0];
              const entries = sourceEntries(row);
              return (
                <tr
                  key={row.component}
                  className={`${i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-blue-50/30 dark:hover:bg-gray-700/30`}
                >
                  <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.component}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.instances.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.fileCount}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {bestMatch ? (
                      <a
                        href={mmdsComponentUrl(bestMatch.component, project)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline font-mono"
                      >
                        {bestMatch.component}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {bestMatch ? confidenceBadge(bestMatch.confidence) : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-col gap-1.5">
                      {entries.map(({ source, category }) => {
                        const url = sourceUrl(category === 'local-oneoff' ? source : undefined, [source], project);
                        return (
                          <div key={source} className="flex flex-row items-center gap-2">
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs truncate max-w-xs" title={source}>
                                {source}
                              </a>
                            ) : (
                              <span className="text-gray-500 dark:text-gray-400 font-mono text-xs truncate max-w-xs" title={source}>
                                {source}
                              </span>
                            )}
                            {sourceCategoryBadge(category)}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {teamsDisplay(row.codeOwners)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No replaceable components match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Candidates table ─────────────────────────────────────────────────────────

function CandidatesTable({
  rows,
  search,
  onSearch,
  sort,
  onSort,
  project,
}: {
  rows: UntrackedComponent[];
  search: string;
  onSearch: (v: string) => void;
  sort: SortState<CandidateSortField>;
  onSort: (field: CandidateSortField) => void;
  project: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="p-6 pb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Future DS Candidates
            {rows.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({rows.length})
              </span>
            )}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            No current MMDS equivalent. High usage across multiple teams may indicate a DS roadmap opportunity.
          </p>
        </div>
        <input
          type="text"
          placeholder="Search components..."
          value={search}
          onChange={e => onSearch(e.target.value)}
          className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <StaticHeader label="#" />
              <StaticHeader label="Component" />
              <SortHeader label="Instances" field="instances" sortState={sort} onSort={onSort} />
              <SortHeader label="Files" field="fileCount" sortState={sort} onSort={onSort} />
              <StaticHeader label="Source" />
              <StaticHeader label="Teams" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {rows.map((row, i) => {
              const entries = sourceEntries(row);
              return (
                <tr
                  key={row.component}
                  className={`${i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50'} hover:bg-blue-50/30 dark:hover:bg-gray-700/30`}
                >
                  <td className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{row.component}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.instances.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{row.fileCount}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-col gap-1.5">
                      {entries.map(({ source, category }) => {
                        const url = sourceUrl(category === 'local-oneoff' ? source : undefined, [source], project);
                        return (
                          <div key={source} className="flex flex-row items-center gap-2">
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs truncate max-w-xs" title={source}>
                                {source}
                              </a>
                            ) : (
                              <span className="text-gray-500 dark:text-gray-400 font-mono text-xs truncate max-w-xs" title={source}>
                                {source}
                              </span>
                            )}
                            {sourceCategoryBadge(category)}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {teamsDisplay(row.codeOwners)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No future DS candidates match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Project section ──────────────────────────────────────────────────────────

function ProjectSection({ data }: { data: UntrackedData }) {
  const [teamFilter, setTeamFilter] = useState('');
  const [replaceSearch, setReplaceSearch] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [replaceSort, setReplaceSort] = useState<SortState<ReplaceSortField>>({ field: 'instances', dir: 'desc' });
  const [candidateSort, setCandidateSort] = useState<SortState<CandidateSortField>>({ field: 'instances', dir: 'desc' });

  const teams = data.teams ?? [];

  // Fallback replaceableInstances for old JSON without the field
  const replaceableInstances = data.summary.replaceableInstances
    ?? data.replaceableWithMMDS.reduce((s, r) => s + r.instances, 0);

  const addressableGap = data.summary.totalJSXUsages > 0
    ? ((replaceableInstances / data.summary.totalJSXUsages) * 100).toFixed(1)
    : '0.0';

  function toggleReplaceSort(field: ReplaceSortField) {
    setReplaceSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { field, dir: field === 'confidence' ? 'asc' : 'desc' },
    );
  }

  function toggleCandidateSort(field: CandidateSortField) {
    setCandidateSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { field, dir: 'desc' },
    );
  }

  const filteredReplaceable = useMemo(
    () => sortReplaceable(filterRows(data.replaceableWithMMDS.filter(r => r.instances >= 5), teamFilter, replaceSearch), replaceSort),
    [data.replaceableWithMMDS, teamFilter, replaceSearch, replaceSort],
  );

  const filteredCandidates = useMemo(
    () => sortCandidates(filterRows(data.futureDSCandidates, teamFilter, candidateSearch), candidateSort),
    [data.futureDSCandidates, teamFilter, candidateSearch, candidateSort],
  );

  return (
    <section className="mb-10">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 capitalize">
        {data.project}
      </h2>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="Untracked Instances"
          value={data.summary.untrackedTotal.toLocaleString()}
          subtitle="JSX usages outside MMDS and component library"
        />
        <SummaryCard
          title="Potential Replacements"
          value={data.summary.replaceableNow}
          subtitle="Unique components with an MMDS equivalent"
        />
        <SummaryCard
          title="Future DS Candidates"
          value={data.summary.futureDSCandidates}
          subtitle="No current MMDS equivalent — possible roadmap signals"
        />
        <SummaryCard
          title="Addressable Gap"
          value={`${addressableGap}%`}
          subtitle="% of total JSX addressable by MMDS today"
        />
      </div>

      {/* Team filter */}
      {teams.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by team:</span>
          <select
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All teams</option>
            {teams.map(t => (
              <option key={t} value={t}>{formatTeam(t)}</option>
            ))}
          </select>
          {teamFilter && (
            <button
              type="button"
              onClick={() => setTeamFilter('')}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
            >
              Clear filter
            </button>
          )}
          {teamFilter && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Showing components owned by <span className="font-medium">{formatTeam(teamFilter)}</span>
            </span>
          )}
        </div>
      )}

      {/* Tables */}
      <div className="space-y-6">
        <ReplaceableTable
          rows={filteredReplaceable}
          project={data.project}
          search={replaceSearch}
          onSearch={setReplaceSearch}
          sort={replaceSort}
          onSort={toggleReplaceSort}
        />
        <CandidatesTable
          rows={filteredCandidates}
          project={data.project}
          search={candidateSearch}
          onSearch={setCandidateSearch}
          sort={candidateSort}
          onSort={toggleCandidateSort}
        />
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
            Run <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">yarn discover:extension</code> and <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">yarn discover:mobile</code> to generate data.
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
            Custom components that bypass the Design System — surfaces opportunities to adopt MMDS equivalents and identifies patterns that could become future DS components.
          </p>
          {(mobileData || extensionData) && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              Last updated:{' '}
              {(mobileData?.date ?? extensionData?.date) || '—'}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 self-center font-medium">Source types:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" title="Component imported from a relative path within the same repo — a local one-off not shared via a package">
              <span>local-oneoff</span>
              <span className="text-blue-500 dark:text-blue-400 font-normal">· relative import, repo-local</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" title="Component imported from a platform primitive package such as react-native, expo, or reanimated">
              <span>platform-primitive</span>
              <span className="text-gray-500 dark:text-gray-400 font-normal">· react-native / expo built-in</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" title="Component imported from a third-party npm package outside MetaMask repos">
              <span>third-party</span>
              <span className="text-amber-600 dark:text-amber-400 font-normal">· external npm package</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" title="Component imported from multiple source types across different usages">
              <span>mixed</span>
              <span className="text-purple-500 dark:text-purple-400 font-normal">· multiple import origins</span>
            </span>
          </div>
        </header>

        {mobileData && <ProjectSection data={mobileData} />}
        {extensionData && <ProjectSection data={extensionData} />}
      </div>
    </div>
  );
}
