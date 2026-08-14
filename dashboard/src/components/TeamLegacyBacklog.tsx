import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CodeOwnerFileOccurrence,
  CodeOwnerStats,
  LegacyReplacementInfo,
} from '../types/metrics';
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
  legacyReplacements?: Record<string, LegacyReplacementInfo>;
  excludedOwners?: Set<string>;
}

interface BacklogRow {
  component: string;
  replacement: string | null;
  replacementOptions: string[];
  replacementGuidance: string | null;
  legacyInstances: number;
  mmdsInstances: number;
  teamMigrationPct: number | null;
  files: CodeOwnerFileOccurrence[];
}

type SortField = 'legacy' | 'mmds' | 'component' | 'migration';

function mmdsPackageDir(project: 'mobile' | 'extension' | string): string {
  return project === 'mobile' ? 'design-system-react-native' : 'design-system-react';
}

function mmdsPackageName(project: 'mobile' | 'extension'): string {
  return project === 'mobile'
    ? '@metamask/design-system-react-native'
    : '@metamask/design-system-react';
}

function githubRepo(project: 'mobile' | 'extension'): string {
  return project === 'mobile' ? 'metamask-mobile' : 'metamask-extension';
}

function mmdsPackagePath(project: string, componentName: string): string {
  const pkg = mmdsPackageDir(project);
  return `https://github.com/MetaMask/metamask-design-system/tree/main/packages/${pkg}/src/components/${componentName}`;
}

function githubFileUrl(project: 'mobile' | 'extension', filePath: string): string {
  return `https://github.com/MetaMask/${githubRepo(project)}/blob/main/${filePath}`;
}

function mmdsMigrationGuideUrl(project: 'mobile' | 'extension', componentName: string): string {
  const pkg = mmdsPackageDir(project);
  return `https://github.com/MetaMask/metamask-design-system/blob/main/packages/${pkg}/MIGRATION.md#${componentName.toLowerCase()}-component`;
}

function mmdsReadmeUrl(project: 'mobile' | 'extension', componentName: string): string {
  const pkg = mmdsPackageDir(project);
  return `https://github.com/MetaMask/metamask-design-system/blob/main/packages/${pkg}/src/components/${componentName}/README.md`;
}

function mmdsStorybookUrl(componentName: string): string {
  return `https://metamask.github.io/metamask-design-system/?path=/docs/react-components-${componentName.toLowerCase()}--docs`;
}

function legacyComponentSearchUrl(project: 'mobile' | 'extension', componentName: string): string {
  return `https://github.com/MetaMask/${githubRepo(project)}/search?q=${encodeURIComponent(componentName)}&type=code`;
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

function resolveReplacementInfo(
  component: string,
  replacementMap: Map<string, string>,
  legacyReplacements?: Record<string, LegacyReplacementInfo>,
): Pick<BacklogRow, 'replacement' | 'replacementOptions' | 'replacementGuidance'> {
  const mapped = legacyReplacements?.[component];
  const options =
    mapped?.replacementOptions && mapped.replacementOptions.length > 0
      ? mapped.replacementOptions
      : mapped?.replacement
        ? [mapped.replacement]
        : [];

  const replacement =
    replacementMap.get(component) ??
    mapped?.replacement ??
    options[0] ??
    null;

  return {
    replacement,
    replacementOptions: options.length > 0 ? options : replacement ? [replacement] : [],
    replacementGuidance: mapped?.guidance ?? null,
  };
}

function countMmdsInstances(
  mmds: Record<string, number>,
  component: string,
  replacementOptions: string[],
): number {
  if (replacementOptions.length > 0) {
    return replacementOptions.reduce((sum, name) => sum + (mmds[name] ?? 0), 0);
  }
  return mmds[component] ?? 0;
}

function buildTeamBacklog(
  stats: CodeOwnerStats,
  replacementMap: Map<string, string>,
  legacyReplacements?: Record<string, LegacyReplacementInfo>,
): BacklogRow[] {
  const deprecated = stats.deprecatedByComponent || {};
  const mmds = stats.mmdsByComponent || {};
  const filesByComponent = stats.deprecatedFilesByComponent || {};
  const names = new Set([...Object.keys(deprecated), ...Object.keys(mmds)]);

  const rows: BacklogRow[] = [];
  for (const component of names) {
    const legacyInstances = deprecated[component] ?? 0;
    if (legacyInstances <= 0) continue;

    const replacementInfo = resolveReplacementInfo(
      component,
      replacementMap,
      legacyReplacements,
    );
    const mmdsInstances = countMmdsInstances(
      mmds,
      component,
      replacementInfo.replacementOptions,
    );
    const total = legacyInstances + mmdsInstances;
    rows.push({
      component,
      ...replacementInfo,
      legacyInstances,
      mmdsInstances,
      teamMigrationPct: total > 0 ? (mmdsInstances / total) * 100 : null,
      files: filesByComponent[component] || [],
    });
  }

  return rows;
}

function ReplacementCell({
  project,
  replacementOptions,
  guidance,
}: {
  project: 'mobile' | 'extension';
  replacementOptions: string[];
  guidance: string | null;
}) {
  if (replacementOptions.length > 0) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {replacementOptions.map((name, index) => (
          <span key={name} className="inline-flex items-center gap-x-1">
            {index > 0 && <span className="text-gray-400 dark:text-gray-500">·</span>}
            <a
              href={mmdsPackagePath(project, name)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-blue-600 dark:text-blue-400 hover:underline font-mono"
            >
              {name}
            </a>
          </span>
        ))}
      </span>
    );
  }

  if (guidance) {
    return (
      <span
        className="text-xs text-amber-700 dark:text-amber-300 italic"
        title={guidance}
      >
        {guidance}
      </span>
    );
  }

  return <span className="text-gray-400 dark:text-gray-500">—</span>;
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function splitFilePath(filePath: string): { directory: string; fileName: string } {
  const separator = filePath.lastIndexOf('/');
  if (separator === -1) return { directory: '', fileName: filePath };
  return {
    directory: filePath.slice(0, separator),
    fileName: filePath.slice(separator + 1),
  };
}

function buildAgentHandoffText(opts: {
  project: 'mobile' | 'extension';
  team: string;
  codeOwner: string;
  component: string;
  replacement: string | null;
  replacementOptions: string[];
  replacementGuidance: string | null;
  legacyInstances: number;
  mmdsInstances: number;
  teamMigrationPct: number | null;
  files: CodeOwnerFileOccurrence[];
}): string {
  const {
    project,
    team,
    codeOwner,
    component,
    replacement,
    replacementOptions,
    replacementGuidance,
    legacyInstances,
    mmdsInstances,
    teamMigrationPct,
    files,
  } = opts;

  const fileTotal = files.reduce((sum, f) => sum + f.count, 0);
  const instanceCount = fileTotal > 0 ? fileTotal : legacyInstances;
  const pkg = mmdsPackageName(project);
  const repo = githubRepo(project);
  const hasReplacement = replacementOptions.length > 0 || Boolean(replacement);
  const replacementLabel =
    replacementOptions.length > 0
      ? replacementOptions.join(' or ')
      : replacement;

  const lines: string[] = [
    `# Task: Replace all legacy \`${component}\` instances with MMDS`,
    '',
    '## Goal',
    `Replace **every** remaining legacy \`${component}\` usage owned by **${team}** (\`${codeOwner}\`) in **${repo}** with the MMDS equivalent.`,
    'Do not leave any of the listed legacy instances behind. Update imports, JSX usage, and props to the MMDS API.',
    '',
    '## Scope',
    `- Project: ${project} (${repo})`,
    `- CODEOWNERS team: ${team} (${codeOwner})`,
    `- Legacy component: \`${component}\``,
    hasReplacement
      ? `- MMDS replacement: \`${replacementLabel}\` from \`${pkg}\``
      : replacementGuidance
        ? `- MMDS replacement: **not auto-mapped** — ${replacementGuidance}`
        : `- MMDS replacement: **none listed yet** — confirm the correct MMDS component before changing call sites`,
    `- Legacy instances to migrate: **${instanceCount}** across **${files.length}** file(s)`,
    `- Current MMDS usage by this team for target component(s): ${mmdsInstances}`,
  ];

  if (teamMigrationPct != null) {
    lines.push(`- Team migration for this component: ${teamMigrationPct.toFixed(0)}%`);
  }

  lines.push(
    '',
    '## Component references',
    '### Legacy (current / deprecated)',
    `- Component: \`${component}\``,
    `- Code search in ${repo}: ${legacyComponentSearchUrl(project, component)}`,
    '',
    '### MMDS (target)',
  );

  if (hasReplacement && replacementOptions.length > 0) {
    for (const target of replacementOptions) {
      lines.push(
        `- Component: \`${target}\``,
        `- Package: \`${pkg}\``,
        `- Source: ${mmdsPackagePath(project, target)}`,
        `- Migration guide: ${mmdsMigrationGuideUrl(project, target)}`,
        `- Component README: ${mmdsReadmeUrl(project, target)}`,
      );
      if (project === 'extension') {
        lines.push(`- Storybook: ${mmdsStorybookUrl(target)}`);
      }
      lines.push('');
    }
    lines.push(
      '## Instructions',
      `1. Read the MMDS migration guides and README/source above before editing.`,
      `2. For each file below, find every legacy \`${component}\` import and JSX usage.`,
      replacementOptions.length > 1
        ? `3. Replace each legacy import with the appropriate option from \`${replacementLabel}\` in \`${pkg}\`.`
        : `3. Replace each legacy import with \`${replacementOptions[0]}\` from \`${pkg}\`.`,
      replacementOptions.length > 1
        ? `4. Update JSX tags to the chosen MMDS component(s) from \`${replacementLabel}\`.`
        : `4. Update JSX tags from \`<${component}>\` to \`<${replacementOptions[0]}>\` (and closing tags).`,
      '5. Map props to the MMDS API — do not assume prop names/values are identical; compare against the MMDS docs.',
      '6. Remove unused legacy imports after the swap.',
      '7. Keep behavior and accessibility equivalent; fix TypeScript and lint issues introduced by the migration.',
      `8. When finished, there should be **0** remaining legacy \`${component}\` instances in the listed files.`,
    );
  } else if (hasReplacement && replacement) {
    lines.push(
      `- Component: \`${replacement}\``,
      `- Package: \`${pkg}\``,
      `- Source: ${mmdsPackagePath(project, replacement)}`,
      `- Migration guide: ${mmdsMigrationGuideUrl(project, replacement)}`,
      `- Component README: ${mmdsReadmeUrl(project, replacement)}`,
    );
    if (project === 'extension') {
      lines.push(`- Storybook: ${mmdsStorybookUrl(replacement)}`);
    }
    lines.push(
      '',
      '## Instructions',
      `1. Read the MMDS \`${replacement}\` migration guide and README/source above before editing.`,
      `2. For each file below, find every legacy \`${component}\` import and JSX usage.`,
      `3. Replace each legacy import with \`${replacement}\` from \`${pkg}\`.`,
      `4. Update JSX tags from \`<${component}>\` to \`<${replacement}>\` (and closing tags).`,
      '5. Map props to the MMDS API — do not assume prop names/values are identical; compare against the MMDS docs.',
      '6. Remove unused legacy imports after the swap.',
      '7. Keep behavior and accessibility equivalent; fix TypeScript and lint issues introduced by the migration.',
      `8. When finished, there should be **0** remaining legacy \`${component}\` instances in the listed files.`,
    );
  } else {
    lines.push(
      `- No tracked MMDS replacement is configured for \`${component}\`.`,
      replacementGuidance ? `- Deprecation guidance: ${replacementGuidance}` : '',
      `- Package to investigate: \`${pkg}\``,
      '- Design system repo: https://github.com/MetaMask/metamask-design-system',
      '',
      '## Instructions',
      `1. Identify the correct MMDS replacement for legacy \`${component}\` in \`${pkg}\`.`,
      '2. Confirm API differences before editing call sites.',
      `3. Replace every listed legacy \`${component}\` instance with the chosen MMDS component.`,
      '4. Update imports, JSX, and props; remove unused legacy imports.',
      '5. Keep behavior and accessibility equivalent; fix TypeScript and lint issues.',
    );
  }

  lines.push(
    '',
    '## Files to update',
    'Each line is `path (instance count)` with a GitHub link.',
  );

  if (files.length === 0) {
    lines.push('- No file-level locations available in this metrics snapshot.');
  } else {
    for (const entry of files) {
      lines.push(`- ${entry.file} (${entry.count}) — ${githubFileUrl(project, entry.file)}`);
    }
  }

  lines.push(
    '',
    '## Acceptance criteria',
    `- [ ] All ${instanceCount} legacy \`${component}\` instance(s) in the files above are migrated`,
    hasReplacement
      ? `- [ ] Imports use \`${replacementLabel}\` from \`${pkg}\``
      : `- [ ] Imports use the confirmed MMDS replacement from \`${pkg}\``,
    '- [ ] Props match the MMDS API (no leftover legacy-only props)',
    '- [ ] Typecheck / lint clean for touched files',
    '- [ ] No unused legacy imports remain',
  );

  return lines.join('\n');
}

export function TeamLegacyBacklog({
  title,
  project,
  codeOwnerStats,
  components,
  legacyReplacements,
  excludedOwners,
}: TeamLegacyBacklogProps) {
  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('legacy');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

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
    let list = buildTeamBacklog(
      codeOwnerStats[selectedOwner],
      replacementMap,
      legacyReplacements,
    );
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.component.toLowerCase().includes(q) ||
          (r.replacement?.toLowerCase().includes(q) ?? false) ||
          r.replacementOptions.some((name) => name.toLowerCase().includes(q)) ||
          (r.replacementGuidance?.toLowerCase().includes(q) ?? false),
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
  }, [codeOwnerStats, selectedOwner, replacementMap, legacyReplacements, search, sortField, sortDir]);

  const selectedTeam = teams.find((t) => t.owner === selectedOwner);
  const totalLegacy = rows.reduce((sum, r) => sum + r.legacyInstances, 0);
  const detailRow = rows.find((r) => r.component === selectedComponent) ?? null;
  const detailMaxFileInstances = Math.max(
    1,
    ...(detailRow?.files.map((entry) => entry.count) ?? []),
  );

  useEffect(() => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    setSelectedComponent(null);
    setPanelClosing(false);
    setCopied(false);
  }, [selectedOwner]);

  useEffect(
    () => () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!selectedComponent) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePanel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedComponent, panelClosing]);

  function closePanel() {
    if (!selectedComponent || panelClosing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSelectedComponent(null);
      return;
    }
    setPanelClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedComponent(null);
      setPanelClosing(false);
      closeTimerRef.current = null;
    }, 220);
  }

  function openPanel(component: string) {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setPanelClosing(false);
    setSelectedComponent(component);
  }

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

  function exportTeamJson() {
    if (!selectedTeam) return;
    const payload = {
      project,
      team: selectedTeam.label,
      codeOwner: selectedOwner,
      generatedAt: new Date().toISOString(),
      totals: {
        legacyInstances: rows.reduce((sum, r) => sum + r.legacyInstances, 0),
        mmdsInstances: rows.reduce((sum, r) => sum + r.mmdsInstances, 0),
        componentsRemaining: rows.length,
      },
      components: rows.map((row) => ({
        component: row.component,
        mmdsReplacement: row.replacement,
        legacyInstances: row.legacyInstances,
        mmdsInstances: row.mmdsInstances,
        teamMigrationPct:
          row.teamMigrationPct != null ? Number(row.teamMigrationPct.toFixed(1)) : null,
        files: row.files,
      })),
    };

    downloadJson(`${project}-${slugify(selectedTeam.label)}-legacy-instances.json`, payload);
  }

  async function copyAgentHandoff() {
    if (!detailRow || !selectedTeam) return;
    const text = buildAgentHandoffText({
      project,
      team: selectedTeam.label,
      codeOwner: selectedOwner,
      component: detailRow.component,
      replacement: detailRow.replacement,
      replacementOptions: detailRow.replacementOptions,
      replacementGuidance: detailRow.replacementGuidance,
      legacyInstances: detailRow.legacyInstances,
      mmdsInstances: detailRow.mmdsInstances,
      teamMigrationPct: detailRow.teamMigrationPct,
      files: detailRow.files,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (teams.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mt-6">
      <div className="p-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Remaining legacy (deprecated) component usage by team. Click a component to see
            file locations, or export JSON for agent handoff.
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
          <button
            type="button"
            onClick={exportTeamJson}
            disabled={rows.length === 0}
            className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export JSON
          </button>
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

      <div className="px-4 py-2.5 border-b border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
        </svg>
        Select any component row to view its affected files and create an agent migration prompt.
      </div>

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
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Files
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {rows.map((row, i) => {
              const isOpen = selectedComponent === row.component;
              const toggleRow = () => {
                if (isOpen) closePanel();
                else openPanel(row.component);
              };
              return (
                <tr
                  key={row.component}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  title="Show files with legacy instances"
                  onClick={toggleRow}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleRow();
                    }
                  }}
                  className={`${
                    i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/40'
                  } ${isOpen ? 'bg-amber-50/70 dark:bg-amber-900/20' : ''} group hover:bg-blue-50/60 dark:hover:bg-blue-950/20 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500`}
                >
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold font-mono text-blue-600 dark:text-blue-400">
                    {row.component}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <ReplacementCell
                      project={project}
                      replacementOptions={row.replacementOptions}
                      guidance={row.replacementGuidance}
                    />
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
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-700 rounded-full px-2.5 py-1 transition-colors group-hover:bg-blue-700 group-hover:border-blue-700 group-hover:text-white dark:group-hover:bg-blue-500 dark:group-hover:border-blue-500 dark:group-hover:text-gray-950">
                      View {row.files.length}
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                      </svg>
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                  {search
                    ? 'No components match the current filter.'
                    : 'No remaining legacy components for this team.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailRow && selectedTeam && (
        <div
          className={`legacy-panel-backdrop fixed inset-0 z-40 flex items-stretch justify-end bg-black/40 ${
            panelClosing ? 'legacy-panel-backdrop--closing' : ''
          }`}
          onClick={closePanel}
          role="presentation"
        >
          <aside
            className={`legacy-panel w-full max-w-2xl bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col ${
              panelClosing ? 'legacy-panel--closing' : ''
            }`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="legacy-file-panel-title"
          >
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-start justify-between gap-4">
                <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {selectedTeam.label} · {project}
                </p>
                <h4
                  id="legacy-file-panel-title"
                  className="text-lg font-semibold text-gray-900 dark:text-white font-mono mt-1"
                >
                  {detailRow.component}
                </h4>
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none px-1"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-5">
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 p-3">
                  <p className="text-xs text-red-600 dark:text-red-400">Legacy instances</p>
                  <p className="text-xl font-semibold tabular-nums text-red-700 dark:text-red-300 mt-0.5">
                    {detailRow.legacyInstances.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Files affected</p>
                  <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-white mt-0.5">
                    {detailRow.files.length.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 p-3">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">Replace with</p>
                  <div className="mt-1">
                    <ReplacementCell
                      project={project}
                      replacementOptions={detailRow.replacementOptions}
                      guidance={detailRow.replacementGuidance}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-b border-gray-100 dark:border-gray-700 bg-blue-50/70 dark:bg-blue-950/20">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17 9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Hand this migration to a coding agent
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-lg">
                    Copy a complete prompt with the migration goal, component documentation,
                    every affected file, instance counts, and acceptance criteria.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={copyAgentHandoff}
                      className="text-sm font-semibold px-3.5 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                    >
                      {copied ? 'Agent prompt copied ✓' : 'Copy migration prompt'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadJson(
                          `${project}-${slugify(selectedTeam.label)}-${slugify(detailRow.component)}-files.json`,
                          {
                            project,
                            team: selectedTeam.label,
                            codeOwner: selectedOwner,
                            component: detailRow.component,
                            mmdsReplacement: detailRow.replacement,
                            mmdsReplacementOptions: detailRow.replacementOptions,
                            replacementGuidance: detailRow.replacementGuidance,
                            legacyInstances: detailRow.legacyInstances,
                            generatedAt: new Date().toISOString(),
                            files: detailRow.files,
                          },
                        )
                      }
                      disabled={detailRow.files.length === 0}
                      className="text-sm font-medium px-3 py-2 rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-950/40 disabled:opacity-40"
                    >
                      Download JSON
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {detailRow.files.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
                  File-level locations are not in this metrics snapshot yet. Re-run the metrics
                  pipeline to populate them.
                </p>
              ) : (
                <>
                  <div className="sticky top-0 z-10 px-5 py-3 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Files to migrate
                      </h5>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Ordered by highest number of legacy instances
                      </p>
                    </div>
                    <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2.5 py-1">
                      {detailRow.files.length} files
                    </span>
                  </div>
                  <ol className="divide-y divide-gray-100 dark:divide-gray-800">
                  {detailRow.files.map((entry) => (
                    <li
                      key={entry.file}
                      className="px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          {(() => {
                            const { directory, fileName } = splitFilePath(entry.file);
                            return (
                              <a
                                href={githubFileUrl(project, entry.file)}
                                target="_blank"
                                rel="noreferrer"
                                className="group block min-w-0"
                                title={`Open ${entry.file} on GitHub`}
                              >
                                <span className="block text-sm font-semibold font-mono text-blue-600 dark:text-blue-400 group-hover:underline break-all">
                                  {fileName}
                                </span>
                                {directory && (
                                  <span className="block text-xs font-mono text-gray-500 dark:text-gray-400 mt-1 break-all">
                                    {directory}/
                                  </span>
                                )}
                              </a>
                            );
                          })()}
                        </div>
                        <span className="shrink-0 text-xs tabular-nums font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-full px-2.5 py-1">
                          {entry.count} {entry.count === 1 ? 'instance' : 'instances'}
                        </span>
                      </div>
                      <div className="h-1.5 mt-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-red-400 dark:bg-red-500"
                          style={{ width: `${Math.max(4, (entry.count / detailMaxFileInstances) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                  </ol>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
