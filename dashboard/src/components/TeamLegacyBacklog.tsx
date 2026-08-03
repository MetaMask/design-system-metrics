import { useMemo, useState } from 'react';
import type { CodeOwnerStats } from '../types/metrics';
import { formatOwnerLabel, normalizeOwner } from '../constants/codeOwners';

function isUnknownOwner(owner: string): boolean {
  const normalized = owner.replace(/^@/, '').toLowerCase();
  return normalized === 'unknown' || normalized === 'metamask/unknown';
}

function teamLabel(owner: string): string {
  return isUnknownOwner(owner) ? 'No CODEOWNERS' : formatOwnerLabel(owner);
}

interface ReplacementComponentRow {
  replacementComponent: string;
  legacyComponents: string[];
  legacyInstances: number;
  mmdsInstances: number;
  migrationPercentage: string;
}

interface TeamLegacyBacklogProps {
  title: string;
  project: 'mobile' | 'extension';
  codeOwnerStats: Record<string, CodeOwnerStats>;
  components?: ReplacementComponentRow[];
  excludedOwners?: Set<string>;
}

interface BacklogRow {
  component: string;
  replacement: string | null;
  legacyInstances: number;
  mmdsInstances: number;
  teamMigrationPct: number | null;
}

type SortField = 'legacy' | 'mmds' | 'component' | 'migration';

function mmdsPackagePath(project: string, componentName: string): string {
  const pkg = project === 'mobile' ? 'design-system-react-native' : 'design-system-react';
  return `https://github.com/MetaMask/metamask-design-system/tree/main/packages/${pkg}/src/components/${componentName}`;
}

function buildReplacementMap(
  components: ReplacementComponentRow[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of components || []) {
    map.set(row.replacementComponent, row.replacementComponent);
    for (const legacy of row.legacyComponents || []) {
      map.set(legacy, row.replacementComponent);
    }
  }
  return map;
}

function buildTeamBacklog(
  stats: CodeOwnerStats,
  replacementMap: Map<string, string>,
): BacklogRow[] {
  const deprecated = stats.deprecatedByComponent || {};
  const mmds = stats.mmdsByComponent || {};
  const names = new Set([...Object.keys(deprecated), ...Object.keys(mmds)]);

  const rows: BacklogRow[] = [];
  for (const component of names) {
    const legacyInstances = deprecated[component] ?? 0;
    if (legacyInstances <= 0) continue;

    const mmdsInstances = mmds[component] ?? 0;
    const total = legacyInstances + mmdsInstances;
    rows.push({
      component,
      replacement: replacementMap.get(component) ?? null,
      legacyInstances,
      mmdsInstances,
      teamMigrationPct: total > 0 ? (mmdsInstances / total) * 100 : null,
    });
  }

  return rows;
}

export function TeamLegacyBacklog({
  title,
  project,
  codeOwnerStats,
  components,
  excludedOwners,
}: TeamLegacyBacklogProps) {
  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('legacy');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const replacementMap = useMemo(() => buildReplacementMap(components), [components]);

  const teams = useMemo(() => {
    return Object.entries(codeOwnerStats)
      .filter(([owner, stats]) => {
        if (excludedOwners?.has(normalizeOwner(owner))) return false;
        return (stats.deprecatedInstances ?? 0) > 0;
      })
      .map(([owner, stats]) => ({
        owner,
        label: teamLabel(owner),
        legacyInstances: stats.deprecatedInstances,
        componentCount: Object.values(stats.deprecatedByComponent || {}).filter((n) => n > 0).length,
      }))
      .sort((a, b) => {
        // Keep "No CODEOWNERS" at the bottom of the dropdown.
        if (isUnknownOwner(a.owner) !== isUnknownOwner(b.owner)) {
          return isUnknownOwner(a.owner) ? 1 : -1;
        }
        return b.legacyInstances - a.legacyInstances;
      });
  }, [codeOwnerStats, excludedOwners]);

  const selectedOwner = teamFilter || teams[0]?.owner || '';

  const rows = useMemo(() => {
    if (!selectedOwner || !codeOwnerStats[selectedOwner]) return [];
    let list = buildTeamBacklog(codeOwnerStats[selectedOwner], replacementMap);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.component.toLowerCase().includes(q) ||
          (r.replacement?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'legacy') cmp = a.legacyInstances - b.legacyInstances;
      else if (sortField === 'mmds') cmp = a.mmdsInstances - b.mmdsInstances;
      else if (sortField === 'component') cmp = a.component.localeCompare(b.component);
      else if (sortField === 'migration') {
        cmp = (a.teamMigrationPct ?? -1) - (b.teamMigrationPct ?? -1);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [codeOwnerStats, selectedOwner, replacementMap, search, sortField, sortDir]);

  const selectedTeam = teams.find((t) => t.owner === selectedOwner);
  const totalLegacy = rows.reduce((sum, r) => sum + r.legacyInstances, 0);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir(field === 'component' ? 'asc' : 'desc');
    }
  }

  function SortHeader({ label, field }: { label: string; field: SortField }) {
    const active = sortField === field;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200"
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={active ? '' : 'opacity-30'}>
            {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
          </span>
        </span>
      </th>
    );
  }

  if (teams.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mt-6">
      <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Remaining legacy (deprecated) component usage by team. Filter a team to see which
            components still need migrating to MMDS.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Team</span>
            <select
              value={selectedOwner}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[180px]"
            >
              {teams.map((t) => (
                <option key={t.owner} value={t.owner}>
                  {t.label} ({t.legacyInstances.toLocaleString()} legacy)
                </option>
              ))}
            </select>
          </label>
          <input
            type="text"
            placeholder="Filter components…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 w-44 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {selectedTeam && (
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 flex flex-wrap gap-4 text-sm bg-gray-50/60 dark:bg-gray-900/30">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Team </span>
            <span className="font-semibold text-gray-900 dark:text-white">{selectedTeam.label}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Legacy instances </span>
            <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
              {selectedTeam.legacyInstances.toLocaleString()}
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Components remaining </span>
            <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
              {selectedTeam.componentCount}
            </span>
          </div>
          {search && (
            <div>
              <span className="text-gray-500 dark:text-gray-400">Filtered </span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                {rows.length} · {totalLegacy.toLocaleString()} instances
              </span>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/40">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 w-10">
                #
              </th>
              <SortHeader label="Component" field="component" />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                MMDS replacement
              </th>
              <SortHeader label="Legacy" field="legacy" />
              <SortHeader label="MMDS" field="mmds" />
              <SortHeader label="Team mig %" field="migration" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {rows.map((row, i) => {
              const replacement = row.replacement;
              return (
                <tr
                  key={row.component}
                  className={`${
                    i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/40'
                  } hover:bg-amber-50/40 dark:hover:bg-amber-900/10 transition-colors`}
                >
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white font-mono">
                    {row.component}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {replacement ? (
                      <a
                        href={mmdsPackagePath(project, replacement)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline font-mono"
                      >
                        {replacement}
                      </a>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums font-medium text-red-600 dark:text-red-400">
                    {row.legacyInstances.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                    {row.mmdsInstances > 0 ? row.mmdsInstances.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums text-gray-700 dark:text-gray-300">
                    {row.teamMigrationPct != null ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.min(row.teamMigrationPct, 100)}%` }}
                          />
                        </span>
                        {row.teamMigrationPct.toFixed(0)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  {search
                    ? 'No components match the current filter.'
                    : 'No remaining legacy components for this team.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
