import { useMemo, useState } from 'react';
import { useAlignmentData, useAlignmentTimeline } from '../hooks/useMetricsData';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import type {
  AlignmentClassification,
  AlignmentComponent,
  AlignmentFamily,
  AlignmentTimeline,
} from '../types/metrics';

type MatrixFilter = 'all' | 'gaps' | 'required' | 'exceptions';

function coverageDelta(timeline: AlignmentTimeline | null): number | null {
  if (!timeline || timeline.requiredCoverage.length < 2) return null;
  const latest = timeline.requiredCoverage[timeline.requiredCoverage.length - 1];
  const prev = timeline.requiredCoverage[timeline.requiredCoverage.length - 2];
  if (latest == null || prev == null) return null;
  return Math.round((latest - prev) * 10) / 10;
}

function gapsDelta(timeline: AlignmentTimeline | null): number | null {
  if (!timeline || timeline.openGaps.length < 2) return null;
  const latest = timeline.openGaps[timeline.openGaps.length - 1];
  const prev = timeline.openGaps[timeline.openGaps.length - 2];
  if (latest == null || prev == null) return null;
  return latest - prev;
}

function classificationLabel(kind: AlignmentClassification): string {
  if (kind === 'required_shared') return 'Required';
  if (kind === 'platform_exception') return 'Exception';
  return 'Helper';
}

function Presence({
  present,
  required,
}: {
  present: boolean;
  required: boolean;
}) {
  if (present) {
    return (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        Yes
      </span>
    );
  }
  if (!required) {
    return (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
      No
    </span>
  );
}

function FigmaCell({ status, url }: { status: AlignmentComponent['figma']; url: string | null }) {
  if (status === 'linked' || status === 'present') {
    const label = status === 'present' ? 'Yes' : 'Linked';
    const pill = (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        {label}
      </span>
    );
    if (!url) return pill;
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex hover:opacity-80">
        {pill}
      </a>
    );
  }
  if (status === 'missing') {
    return (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-100 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
        No
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
      Unknown
    </span>
  );
}

type Tone = 'bad' | 'warn' | 'good';

/** Below 70% is not close enough to call the system aligned; 90% is the "healthy" bar. */
function coverageTone(pct: number): Tone {
  if (pct < 70) return 'bad';
  if (pct < 90) return 'warn';
  return 'good';
}

const TONE_TEXT: Record<Tone, string> = {
  bad: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  good: 'text-emerald-600 dark:text-emerald-400',
};

const TONE_BAR: Record<Tone, string> = {
  bad: 'bg-red-500',
  warn: 'bg-amber-500',
  good: 'bg-emerald-500',
};

const TONE_LABEL: Record<Tone, string> = {
  bad: 'Needs work',
  warn: 'Improving',
  good: 'Healthy',
};

function KpiCard({
  title,
  value,
  subtitle,
  tone,
  fillPercent,
  delta,
  deltaPositiveIsGood,
}: {
  title: string;
  value: string;
  subtitle: string;
  tone: Tone;
  /** Share of the goal met, drawn as a proportion bar under the value. */
  fillPercent: number;
  delta?: number | null;
  deltaPositiveIsGood?: boolean;
}) {
  const showDelta = delta != null && delta !== 0;
  const isGood = delta != null && (deltaPositiveIsGood ? delta > 0 : delta < 0);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h3>
        <span className={`text-xs font-medium ${TONE_TEXT[tone]}`}>{TONE_LABEL[tone]}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-3xl font-semibold ${TONE_TEXT[tone]}`}>{value}</p>
        {showDelta && (
          <span className={`text-sm font-medium ${isGood ? 'text-emerald-600' : 'text-red-600'}`}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-1.5 rounded-full ${TONE_BAR[tone]}`}
          style={{ width: `${Math.max(0, Math.min(100, fillPercent))}%` }}
        />
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{subtitle}</p>
    </div>
  );
}

function familyMembersLabel(family: AlignmentFamily): string {
  const side = (names: string[], present: number, platform: string) =>
    names.length === 0 ? `${platform}: not required` : `${platform}: ${present}/${names.length}`;
  return `${side(family.react, family.reactPresent, 'React')} · ${side(
    family.reactNative,
    family.reactNativePresent,
    'React Native'
  )}`;
}

function missingLabel(missingOn: Array<'react' | 'reactNative'>): string {
  return missingOn
    .map((p) => (p === 'react' ? 'React' : 'React Native'))
    .join(', ');
}

function githubComponentUrl(platform: 'react' | 'reactNative', name: string): string {
  const pkg = platform === 'react' ? 'design-system-react' : 'design-system-react-native';
  return `https://github.com/MetaMask/metamask-design-system/tree/main/packages/${pkg}/src/components/${name}`;
}

export function Alignment() {
  const { data, loading, error } = useAlignmentData();
  const { data: timeline } = useAlignmentTimeline();
  const [filter, setFilter] = useState<MatrixFilter>('all');

  const rows = useMemo(() => {
    if (!data) return [];
    return data.components.filter((c) => {
      if (filter === 'gaps') return c.missingOn.length > 0;
      if (filter === 'required') return c.classification === 'required_shared';
      if (filter === 'exceptions') return c.classification !== 'required_shared';
      return true;
    });
  }, [data, filter]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  const s = data.summary;
  const covDelta = coverageDelta(timeline);
  const gapDelta = gapsDelta(timeline);
  const required = data.components.filter((c) => c.classification === 'required_shared');
  const split = [
    {
      label: 'On React and React Native',
      bar: 'bg-emerald-500',
      count: required.filter((c) => c.react && c.reactNative).length,
    },
    {
      label: 'React Native only (React missing)',
      bar: 'bg-red-500',
      count: required.filter((c) => !c.react && c.reactNative).length,
    },
    {
      label: 'React only (React Native missing)',
      bar: 'bg-amber-500',
      count: required.filter((c) => c.react && !c.reactNative).length,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            MMDS Alignment
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-3xl">
            Alignment is MMDS quality across Figma, React, and React Native: the same applicable
            component name and shared core API, unless a platform is supposed to differ. Missing
            required platforms are work. Intentional exceptions are named so they are not treated
            as forgotten ports. Product migration stays on the Migration and Adoption tabs.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Last scanned: {data.date}. Figma <span className="font-medium text-gray-500 dark:text-gray-400">Linked</span> means a Code Connect file points at a Figma node. That is not a live library scan, and unknown is not a gap.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <KpiCard
            title="Required-platform coverage"
            value={`${s.requiredCoverage}%`}
            subtitle={`${s.requiredSharedCount - s.openGaps} of ${s.requiredSharedCount} required components exist on React and React Native`}
            tone={coverageTone(s.requiredCoverage)}
            fillPercent={s.requiredCoverage}
            delta={covDelta}
            deltaPositiveIsGood
          />
          <KpiCard
            title="Open alignment gaps"
            value={String(s.openGaps)}
            subtitle={`Missing on React: ${s.missingOnReact}. Missing on React Native: ${s.missingOnReactNative}.`}
            tone={s.openGaps === 0 ? 'good' : 'bad'}
            fillPercent={
              s.requiredSharedCount === 0 ? 0 : (s.openGaps / s.requiredSharedCount) * 100
            }
            delta={gapDelta}
            deltaPositiveIsGood={false}
          />
          <KpiCard
            title="Code Connect coverage"
            value={`${s.codeConnectCoverage}%`}
            subtitle={`${s.codeConnectMapped} of ${s.codeConnectSlots} code-platform slots have a .figma.tsx file`}
            tone={coverageTone(s.codeConnectCoverage)}
            fillPercent={s.codeConnectCoverage}
          />
        </div>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Where the required components stand
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Every required component sits in exactly one of these buckets.
          </p>
          <div className="flex h-6 w-full overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700">
            {split.map((bucket) =>
              bucket.count === 0 ? null : (
                <div
                  key={bucket.label}
                  className={bucket.bar}
                  style={{ width: `${(bucket.count / Math.max(1, s.requiredSharedCount)) * 100}%` }}
                  title={`${bucket.label}: ${bucket.count}`}
                />
              )
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {split.map((bucket) => (
              <li key={bucket.label} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-sm ${bucket.bar}`} />
                <span className="text-gray-600 dark:text-gray-300">{bucket.label}</span>
                <span className="font-medium text-gray-900 dark:text-white">{bucket.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">This week's queue</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Required components missing on a code platform, React-missing first.
            </p>
          </div>
          {data.queue.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400">
              No required-platform gaps in this scan.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Component</th>
                    <th className="px-6 py-3 font-medium">Missing on</th>
                    <th className="px-6 py-3 font-medium">React</th>
                    <th className="px-6 py-3 font-medium">React Native</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {data.queue.map((item) => (
                    <tr key={item.name}>
                      <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">{item.name}</td>
                      <td className="px-6 py-3 text-red-700 dark:text-red-300">{missingLabel(item.missingOn)}</td>
                      <td className="px-6 py-3">
                        <Presence present={item.react} required />
                      </td>
                      <td className="px-6 py-3">
                        <Presence present={item.reactNative} required />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            Intentional platform families
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Excluded from gaps on purpose. Everything else is assumed shared.
          </p>
          <ul className="text-sm divide-y divide-gray-200 dark:divide-gray-700">
            {data.families.map((family) => (
              <li
                key={family.id}
                title={family.rationale}
                className="py-2 flex flex-wrap items-baseline gap-x-2"
              >
                <span className="font-medium text-gray-900 dark:text-white">{family.label}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {familyMembersLabel(family)}
                </span>
                {!family.aligned && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    incomplete
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Component matrix</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {s.inventoryCount} components from MMDS packages. Figma linked via Code Connect: {s.figmaLinked}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', 'All'],
                  ['gaps', 'Gaps'],
                  ['required', 'Required'],
                  ['exceptions', 'Exceptions'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    filter === id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Component</th>
                  <th className="px-6 py-3 font-medium">Class</th>
                  <th className="px-6 py-3 font-medium">Figma</th>
                  <th className="px-6 py-3 font-medium">React</th>
                  <th className="px-6 py-3 font-medium">RN</th>
                  <th className="px-6 py-3 font-medium">Connect R</th>
                  <th className="px-6 py-3 font-medium">Connect RN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((c) => (
                  <MatrixRow key={c.name} component={c} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MatrixRow({ component: c }: { component: AlignmentComponent }) {
  const required = c.classification === 'required_shared';
  return (
    <tr>
      <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
        {c.react ? (
          <a
            href={githubComponentUrl('react', c.name)}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-blue-600 dark:hover:text-blue-400"
          >
            {c.name}
          </a>
        ) : c.reactNative ? (
          <a
            href={githubComponentUrl('reactNative', c.name)}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-blue-600 dark:hover:text-blue-400"
          >
            {c.name}
          </a>
        ) : (
          c.name
        )}
      </td>
      <td className="px-6 py-3 text-gray-600 dark:text-gray-300">{classificationLabel(c.classification)}</td>
      <td className="px-6 py-3">
        <FigmaCell status={c.figma} url={c.figmaUrl} />
      </td>
      <td className="px-6 py-3">
        <Presence present={c.react} required={required} />
      </td>
      <td className="px-6 py-3">
        <Presence present={c.reactNative} required={required} />
      </td>
      <td className="px-6 py-3">
        <Presence present={c.codeConnectReact} required={c.react} />
      </td>
      <td className="px-6 py-3">
        <Presence present={c.codeConnectReactNative} required={c.reactNative} />
      </td>
    </tr>
  );
}
