import { useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAlignmentData, useAlignmentTimeline } from '../hooks/useMetricsData';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { formatSignedDelta, weekOverWeekDelta } from '../lib/adoptionMetrics';
import {
  buildWeeklyAlignmentChartSeries,
  headlineWeeklyDelta,
} from '../lib/alignmentMetrics';
import type {
  AlignmentClassification,
  AlignmentComponent,
  AlignmentData,
  AlignmentFamily,
  AlignmentQueueItem,
  AlignmentTimeline,
} from '../types/metrics';

const TREND_WEEKS = 26;
const COVERAGE_GOAL = 90;
/** User-facing label for required_shared components present on both React and RN. */
const CROSS_PLATFORM_COVERAGE_LABEL = 'Total cross-platform coverage';

type MatrixFilter = 'all' | 'gaps' | 'required' | 'exceptions';
type QueueTab = 'platform' | 'codeConnect';
type PlatformFilter = 'all' | 'react' | 'reactNative';
type BucketFilter = 'all' | 'both' | 'rnOnly' | 'reactOnly';

interface CodeConnectGap {
  name: string;
  missingConnect: Array<'react' | 'reactNative'>;
  component: AlignmentComponent;
}

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'work-queue', label: 'Work queue' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'exceptions', label: 'Exceptions' },
] as const;

const BUCKET_LABELS: Record<Exclude<BucketFilter, 'all'>, string> = {
  both: 'On React and React Native',
  rnOnly: 'React Native only (React missing)',
  reactOnly: 'React only (React Native missing)',
};

function coverageDelta(timeline: AlignmentTimeline | null, headline: number): number | null {
  return headlineWeeklyDelta(timeline, headline, timeline?.requiredCoverage ?? []);
}

function gapsDelta(timeline: AlignmentTimeline | null, headline: number): number | null {
  return headlineWeeklyDelta(timeline, headline, timeline?.openGaps ?? []);
}

function codeConnectDelta(timeline: AlignmentTimeline | null, headline: number): number | null {
  return headlineWeeklyDelta(timeline, headline, timeline?.codeConnectCoverage ?? []);
}

function classificationLabel(kind: AlignmentClassification): string {
  if (kind === 'required_shared') return 'Required';
  if (kind === 'platform_exception') return 'Exception';
  return 'Helper';
}

const ALIGNMENT_PILL =
  'inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap';

function AlignmentPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'yes' | 'no' | 'neutral';
}) {
  const toneClass =
    tone === 'yes'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
      : tone === 'no'
      ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400';

  return <span className={`${ALIGNMENT_PILL} ${toneClass}`}>{children}</span>;
}

function Presence({
  present,
  required,
}: {
  present: boolean;
  required: boolean;
}) {
  if (present) {
    return <AlignmentPill tone="yes">Yes</AlignmentPill>;
  }
  if (!required) {
    return <AlignmentPill tone="neutral">—</AlignmentPill>;
  }
  return <AlignmentPill tone="no">No</AlignmentPill>;
}

function FigmaCell({ status, url }: { status: AlignmentComponent['figma']; url: string | null }) {
  if (status === 'linked' || status === 'present') {
    const label = status === 'present' ? 'Yes' : 'Linked';
    const pill = <AlignmentPill tone="yes">{label}</AlignmentPill>;
    if (!url) return pill;
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex hover:opacity-80">
        {pill}
      </a>
    );
  }
  if (status === 'missing') {
    return <AlignmentPill tone="no">No</AlignmentPill>;
  }
  return <AlignmentPill tone="neutral">Unknown</AlignmentPill>;
}

function MissingOnPills({ missingOn }: { missingOn: Array<'react' | 'reactNative'> }) {
  const labels: Record<'react' | 'reactNative', string> = {
    react: 'React',
    reactNative: 'React Native',
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {missingOn.map((platform) => (
        <AlignmentPill key={platform} tone="no">
          {labels[platform]}
        </AlignmentPill>
      ))}
    </div>
  );
}

type Tone = 'bad' | 'warn' | 'good';

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

function WeeklyTrendStat({
  label,
  value,
  delta,
  deltaUnit,
  positiveIsGood,
  accent,
}: {
  label: string;
  value: string;
  delta: number;
  deltaUnit: string;
  positiveIsGood: boolean;
  accent: 'amber' | 'emerald' | 'purple' | 'gray' | 'red';
}) {
  const isFlat = delta === 0;
  const isGood = positiveIsGood ? delta > 0 : delta < 0;
  const accentText = {
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    purple: 'text-purple-600 dark:text-purple-400',
    gray: 'text-gray-900 dark:text-white',
    red: 'text-red-600 dark:text-red-400',
  }[accent];

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/30 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className={`text-xl font-bold mt-0.5 ${accentText}`}>{value}</p>
      <p
        className={`text-xs mt-1 ${
          isFlat
            ? 'text-gray-400 dark:text-gray-500'
            : isGood
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-500 dark:text-red-400'
        }`}
      >
        {isFlat ? 'No change vs prior week' : `${formatSignedDelta(delta, deltaUnit)} vs prior week`}
      </p>
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

function githubComponentUrl(platform: 'react' | 'reactNative', name: string): string {
  const pkg = platform === 'react' ? 'design-system-react' : 'design-system-react-native';
  return `https://github.com/MetaMask/metamask-design-system/tree/main/packages/${pkg}/src/components/${name}`;
}

function buildWeeklySummary(
  data: AlignmentData,
  covDelta: number | null,
  gapDelta: number | null
): string {
  const s = data.summary;
  const covPart =
    covDelta != null && covDelta !== 0
      ? ` (${formatSignedDelta(covDelta, ' pp')} vs prior week)`
      : '';
  const gapPart =
    gapDelta != null && gapDelta !== 0
      ? ` (${formatSignedDelta(gapDelta, '')} vs prior week)`
      : '';
  const topGaps = data.queue
    .slice(0, 5)
    .map((q) => q.name)
    .join(', ');
  return [
    `Alignment ${data.date}: ${s.requiredCoverage}% total cross-platform coverage${covPart}.`,
    `${s.openGaps} open platform gaps${gapPart} (${s.missingOnReact} React, ${s.missingOnReactNative} RN).`,
    `Code Connect ${s.codeConnectCoverage}%.`,
    topGaps ? `Top queue: ${topGaps}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2"
    >
      {children}
    </a>
  );
}

function PlatformQueueActions({ item }: { item: AlignmentQueueItem }) {
  const links: Array<{ key: string; href: string; label: string }> = [];

  if (item.missingOn.includes('react')) {
    if (item.reactNative) {
      links.push({
        key: 'port-rn',
        href: githubComponentUrl('reactNative', item.name),
        label: 'Port from RN',
      });
    }
    links.push({
      key: 'add-react',
      href: githubComponentUrl('react', item.name),
      label: 'Add React',
    });
  }

  if (item.missingOn.includes('reactNative')) {
    if (item.react) {
      links.push({
        key: 'port-react',
        href: githubComponentUrl('react', item.name),
        label: 'Port from React',
      });
    }
    links.push({
      key: 'add-rn',
      href: githubComponentUrl('reactNative', item.name),
      label: 'Add RN',
    });
  }

  if (links.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {links.map((link) => (
        <ActionLink key={link.key} href={link.href}>
          {link.label}
        </ActionLink>
      ))}
    </div>
  );
}

function CodeConnectActions({ component: c }: { component: AlignmentComponent }) {
  const links: Array<{ key: string; href: string; label: string }> = [];

  if (c.react && !c.codeConnectReact) {
    links.push({
      key: 'connect-react',
      href: githubComponentUrl('react', c.name),
      label: 'Add React Connect',
    });
  }
  if (c.reactNative && !c.codeConnectReactNative) {
    links.push({
      key: 'connect-rn',
      href: githubComponentUrl('reactNative', c.name),
      label: 'Add RN Connect',
    });
  }
  if (c.figmaUrl) {
    links.push({ key: 'figma', href: c.figmaUrl, label: 'Figma' });
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {links.map((link) => (
        <ActionLink key={link.key} href={link.href}>
          {link.label}
        </ActionLink>
      ))}
    </div>
  );
}

function buildCodeConnectGapsFromData(data: AlignmentData): CodeConnectGap[] {
  const componentByName = new Map(data.components.map((c) => [c.name, c]));

  if (data.codeConnectQueue?.length) {
    return data.codeConnectQueue
      .map((item) => {
        const component = componentByName.get(item.name);
        if (!component) return null;
        return {
          name: item.name,
          missingConnect: item.missingConnect,
          component,
        };
      })
      .filter((item): item is CodeConnectGap => item != null);
  }

  return buildCodeConnectGaps(data.components);
}

function buildCodeConnectGaps(components: AlignmentComponent[]): CodeConnectGap[] {
  return components
    .filter(
      (c) =>
        (c.react && !c.codeConnectReact) || (c.reactNative && !c.codeConnectReactNative)
    )
    .map((c) => ({
      name: c.name,
      missingConnect: [
        ...(c.react && !c.codeConnectReact ? (['react'] as const) : []),
        ...(c.reactNative && !c.codeConnectReactNative ? (['reactNative'] as const) : []),
      ],
      component: c,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function AlignmentTrendSection({
  timeline,
  data,
}: {
  timeline: AlignmentTimeline | null;
  data: AlignmentData;
}) {
  const s = data.summary;

  const chartData = useMemo(() => {
    if (!timeline) return [];
    return buildWeeklyAlignmentChartSeries(timeline);
  }, [timeline]);

  const trendSlice = chartData.slice(-TREND_WEEKS);
  const hasTrend = trendSlice.length >= 2;

  const PercentTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow p-3 text-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }} className="mb-0.5">
            {p.name}: {p.value != null ? `${Number(p.value).toFixed(1)}%` : '—'}
          </p>
        ))}
      </div>
    );
  };

  const CountTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow p-3 text-xs">
        <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} style={{ color: p.color }} className="mb-0.5">
            {p.name}: {p.value != null ? Number(p.value).toLocaleString() : '—'}
          </p>
        ))}
      </div>
    );
  };

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 mb-8 space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Alignment trends
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Tracks the{' '}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {s.requiredCoverage}% total cross-platform coverage
          </span>{' '}
          headline, open platform gaps ({s.openGaps}), and Code Connect coverage (
          {s.codeConnectCoverage}%).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <WeeklyTrendStat
          label="Cross-platform ↔ headline"
          value={`${s.requiredCoverage}%`}
          delta={weekOverWeekDelta(trendSlice.map((d) => d.coverage ?? 0))}
          deltaUnit=" pp"
          positiveIsGood
          accent="emerald"
        />
        <WeeklyTrendStat
          label="Open gaps ↔ platform queue"
          value={String(s.openGaps)}
          delta={weekOverWeekDelta(trendSlice.map((d) => d.openGaps ?? 0))}
          deltaUnit=""
          positiveIsGood={false}
          accent="red"
        />
        <WeeklyTrendStat
          label="Missing React ↔ queue tab"
          value={String(s.missingOnReact)}
          delta={weekOverWeekDelta(trendSlice.map((d) => d.missingReact ?? 0))}
          deltaUnit=""
          positiveIsGood={false}
          accent="amber"
        />
        <WeeklyTrendStat
          label="Code Connect ↔ design bridge"
          value={`${s.codeConnectCoverage}%`}
          delta={weekOverWeekDelta(trendSlice.map((d) => d.codeConnect ?? 0))}
          deltaUnit=" pp"
          positiveIsGood
          accent="purple"
        />
      </div>

      {hasTrend ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Cross-platform coverage &amp; Code Connect
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendSlice}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip content={<PercentTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="coverage"
                  name={CROSS_PLATFORM_COVERAGE_LABEL}
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="codeConnect"
                  name="Code Connect"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Open platform gaps
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendSlice}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CountTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="openGaps"
                  name="Open gaps"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="missingReact"
                  name="Missing React"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-4 py-3">
          Trend charts appear after two weekly scans (7+ days apart). Same-week re-scans update
          the headline KPIs but are excluded from trends. Snapshot cards above still reflect this
          week&apos;s headline metrics.
        </p>
      )}
    </section>
  );
}

function SectionNav({ activeId }: { activeId: string | null }) {
  return (
    <nav className="sticky top-0 z-20 -mx-6 px-6 py-3 mb-6 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap gap-2">
        {NAV_SECTIONS.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeId === id
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function Alignment() {
  const { data, loading, error } = useAlignmentData();
  const { data: timeline } = useAlignmentTimeline();
  const workQueueRef = useRef<HTMLElement>(null);

  const [matrixFilter, setMatrixFilter] = useState<MatrixFilter>('gaps');
  const [queueTab, setQueueTab] = useState<QueueTab>('platform');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all');
  const [search, setSearch] = useState('');
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);

  const codeConnectGaps = useMemo(
    () => (data ? buildCodeConnectGapsFromData(data) : []),
    [data]
  );

  const codeConnectGapCount = data?.summary.codeConnectGaps ?? codeConnectGaps.length;

  const selectPlatformFilter = (filter: PlatformFilter) => {
    setPlatformFilter(filter);
    setBucketFilter('all');
  };

  const platformQueue = useMemo(() => {
    if (!data) return [];
    let items = data.queue;
    if (platformFilter === 'react') {
      items = items.filter((item) => item.missingOn.includes('react'));
    } else if (platformFilter === 'reactNative') {
      items = items.filter((item) => item.missingOn.includes('reactNative'));
    }
    if (bucketFilter === 'both') {
      items = items.filter((item) => item.react && item.reactNative);
    } else if (bucketFilter === 'rnOnly') {
      items = items.filter((item) => !item.react && item.reactNative);
    } else if (bucketFilter === 'reactOnly') {
      items = items.filter((item) => item.react && !item.reactNative);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((item) => item.name.toLowerCase().includes(q));
    }
    return items;
  }, [data, platformFilter, bucketFilter, search]);

  const filteredCodeConnectGaps = useMemo(() => {
    if (!search.trim()) return codeConnectGaps;
    const q = search.trim().toLowerCase();
    return codeConnectGaps.filter((item) => item.name.toLowerCase().includes(q));
  }, [codeConnectGaps, search]);

  const matrixRows = useMemo(() => {
    if (!data) return [];
    return data.components.filter((c) => {
      if (matrixFilter === 'gaps') return c.missingOn.length > 0;
      if (matrixFilter === 'required') return c.classification === 'required_shared';
      if (matrixFilter === 'exceptions') return c.classification !== 'required_shared';
      return true;
    }).filter((c) => {
      if (!search.trim()) return true;
      return c.name.toLowerCase().includes(search.trim().toLowerCase());
    });
  }, [data, matrixFilter, search]);

  const applyBucketFilter = (bucket: BucketFilter) => {
    setBucketFilter((prev) => (prev === bucket ? 'all' : bucket));
    setPlatformFilter('all');
    setQueueTab('platform');
    setMatrixFilter('gaps');
    workQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const copySummary = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSummaryCopied(true);
      window.setTimeout(() => setSummaryCopied(false), 2000);
    } catch {
      setSummaryCopied(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!data) return null;

  const s = data.summary;
  const covDelta = coverageDelta(timeline, s.requiredCoverage);
  const gapDelta = gapsDelta(timeline, s.openGaps);
  const connectDelta = codeConnectDelta(timeline, s.codeConnectCoverage);
  const weeklySummary = buildWeeklySummary(data, covDelta, gapDelta);
  const required = data.components.filter((c) => c.classification === 'required_shared');
  const split = [
    {
      id: 'both' as const,
      label: 'On React and React Native',
      bar: 'bg-emerald-500',
      count: required.filter((c) => c.react && c.reactNative).length,
      bucket: 'both' as BucketFilter,
    },
    {
      id: 'rnOnly' as const,
      label: 'React Native only (React missing)',
      bar: 'bg-red-500',
      count: required.filter((c) => !c.react && c.reactNative).length,
      bucket: 'rnOnly' as BucketFilter,
    },
    {
      id: 'reactOnly' as const,
      label: 'React only (React Native missing)',
      bar: 'bg-amber-500',
      count: required.filter((c) => c.react && !c.reactNative).length,
      bucket: 'reactOnly' as BucketFilter,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            MMDS Alignment
          </h1>
          <p className="text-gray-500 dark:text-gray-400 max-w-3xl">
            MMDS quality across Figma, React, and React Native. The work queue below is what to
            fix this week; the inventory matrix is the full reference. Product migration stays on
            Migration and Adoption.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Last scanned: {data.date}. Figma{' '}
            <span className="font-medium text-gray-500 dark:text-gray-400">Linked</span> means a
            Code Connect file points at a Figma node — not a live library scan.
          </p>
        </header>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 mb-6 flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-[16rem]">
            {weeklySummary}
          </p>
          <button
            type="button"
            onClick={() => copySummary(weeklySummary)}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            {summaryCopied ? 'Copied' : 'Copy summary'}
          </button>
        </div>

        <SectionNav activeId={null} />

        <section id="overview" className="scroll-mt-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <KpiCard
              title={CROSS_PLATFORM_COVERAGE_LABEL}
              value={`${s.requiredCoverage}%`}
              subtitle={`${s.requiredSharedCount - s.openGaps} of ${s.requiredSharedCount} shared components on both React and React Native · goal ${COVERAGE_GOAL}%`}
              tone={coverageTone(s.requiredCoverage)}
              fillPercent={s.requiredCoverage}
              delta={covDelta}
              deltaPositiveIsGood
            />
            <KpiCard
              title="Open platform gaps"
              value={String(s.openGaps)}
              subtitle={`Missing React: ${s.missingOnReact}. Missing RN: ${s.missingOnReactNative}. See work queue.`}
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
              subtitle={`${s.codeConnectMapped} of ${s.codeConnectSlots} code-platform slots mapped · ${codeConnectGapCount} unmapped in queue`}
              tone={coverageTone(s.codeConnectCoverage)}
              fillPercent={s.codeConnectCoverage}
              delta={connectDelta}
              deltaPositiveIsGood
            />
          </div>

          <AlignmentTrendSection timeline={timeline} data={data} />

          <section className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Required component buckets
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Click a bucket to filter the platform work queue.
              {bucketFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setBucketFilter('all')}
                  className="ml-2 text-blue-600 dark:text-blue-400 underline"
                >
                  Clear filter
                </button>
              )}
            </p>
            <div className="flex h-6 w-full overflow-hidden rounded-md bg-gray-200 dark:bg-gray-700">
              {split.map((bucket) =>
                bucket.count === 0 ? null : (
                  <button
                    key={bucket.id}
                    type="button"
                    onClick={() => applyBucketFilter(bucket.bucket)}
                    className={`${bucket.bar} ${
                      bucketFilter === bucket.bucket ? 'ring-2 ring-inset ring-white/70' : ''
                    } hover:opacity-90 transition-opacity cursor-pointer`}
                    style={{
                      width: `${(bucket.count / Math.max(1, s.requiredSharedCount)) * 100}%`,
                    }}
                    title={`${bucket.label}: ${bucket.count}`}
                    aria-label={`Filter queue to ${bucket.label}`}
                  />
                )
              )}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {split.map((bucket) => (
                <li key={bucket.id}>
                  <button
                    type="button"
                    onClick={() => applyBucketFilter(bucket.bucket)}
                    className={`flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors ${
                      bucketFilter === bucket.bucket
                        ? 'ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-sm ${bucket.bar}`} />
                    <span className="text-gray-600 dark:text-gray-300">{bucket.label}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{bucket.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </section>

        <section
          id="work-queue"
          ref={workQueueRef}
          className="scroll-mt-24 bg-white dark:bg-gray-800 rounded-lg shadow mb-8"
        >
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Work queue</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Platform gaps are missing React or RN ports. Code Connect gaps are missing
                  `.figma.tsx` files on existing components.
                </p>
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search components…"
                className="px-3 py-1.5 rounded-md text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white min-w-[12rem]"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQueueTab('platform')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  queueTab === 'platform'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Platform gaps ({data.queue.length})
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('codeConnect')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                  queueTab === 'codeConnect'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Code Connect gaps ({codeConnectGapCount})
              </button>
            </div>
            {queueTab === 'platform' && bucketFilter !== 'all' && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                <span>
                  Bucket filter active:{' '}
                  {bucketFilter === 'both'
                    ? BUCKET_LABELS.both
                    : BUCKET_LABELS[bucketFilter as Exclude<BucketFilter, 'all' | 'both'>]}
                </span>
                <button
                  type="button"
                  onClick={() => setBucketFilter('all')}
                  className="text-xs font-medium underline underline-offset-2"
                >
                  Clear bucket filter
                </button>
              </div>
            )}
            {queueTab === 'platform' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ['all', `All (${data.queue.length})`],
                    ['react', `Missing React (${s.missingOnReact})`],
                    ['reactNative', `Missing RN (${s.missingOnReactNative})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectPlatformFilter(id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium ${
                      platformFilter === id
                        ? 'bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {queueTab === 'platform' ? (
            platformQueue.length === 0 ? (
              <p className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400">
                No platform gaps match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-6 py-3 font-medium">Component</th>
                      <th className="px-6 py-3 font-medium">Missing on</th>
                      <th className="px-6 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {platformQueue.map((item) => (
                      <tr key={item.name}>
                        <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                          {item.reactNative ? (
                            <ActionLink href={githubComponentUrl('reactNative', item.name)}>
                              {item.name}
                            </ActionLink>
                          ) : item.react ? (
                            <ActionLink href={githubComponentUrl('react', item.name)}>
                              {item.name}
                            </ActionLink>
                          ) : (
                            item.name
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <MissingOnPills missingOn={item.missingOn} />
                        </td>
                        <td className="px-6 py-3">
                          <PlatformQueueActions item={item} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : filteredCodeConnectGaps.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400">
              No Code Connect gaps match the current search.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Component</th>
                    <th className="px-6 py-3 font-medium">Missing Connect</th>
                    <th className="px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCodeConnectGaps.map((item) => (
                    <tr key={item.name}>
                      <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                        {item.component.react ? (
                          <ActionLink href={githubComponentUrl('react', item.name)}>
                            {item.name}
                          </ActionLink>
                        ) : (
                          <ActionLink href={githubComponentUrl('reactNative', item.name)}>
                            {item.name}
                          </ActionLink>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <MissingOnPills missingOn={item.missingConnect} />
                      </td>
                      <td className="px-6 py-3">
                        <CodeConnectActions component={item.component} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="inventory" className="scroll-mt-24 bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Component inventory
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Full matrix for audit. Defaults to gaps — use filters for required components and
                exceptions.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['gaps', 'Gaps'],
                  ['all', 'All'],
                  ['required', 'Required'],
                  ['exceptions', 'Exceptions'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMatrixFilter(id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                    matrixFilter === id
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
                  <th className="px-6 py-3 font-medium">
                    <span title="Linked via Code Connect — not a live Figma scan">Figma</span>
                  </th>
                  <th className="px-6 py-3 font-medium">React</th>
                  <th className="px-6 py-3 font-medium">RN</th>
                  <th className="px-6 py-3 font-medium">
                    <span title=".figma.tsx for React">Connect (R)</span>
                  </th>
                  <th className="px-6 py-3 font-medium">
                    <span title=".figma.tsx for React Native">Connect (RN)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {matrixRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      No components match the current filters.
                    </td>
                  </tr>
                ) : (
                  matrixRows.map((c) => <MatrixRow key={c.name} component={c} families={data.families} />)
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="exceptions" className="scroll-mt-24 bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
          <button
            type="button"
            onClick={() => setExceptionsOpen((open) => !open)}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Intentional platform families
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Excluded from gaps on purpose — {data.families.length} families,{' '}
                {s.familiesAligned}/{s.familiesTotal} aligned.
              </p>
            </div>
            <span className="text-gray-400 text-sm">{exceptionsOpen ? 'Hide' : 'Show'}</span>
          </button>
          {exceptionsOpen && (
            <ul className="px-6 pb-6 text-sm divide-y divide-gray-200 dark:divide-gray-700 border-t border-gray-200 dark:border-gray-700">
              {data.families.map((family) => (
                <li
                  key={family.id}
                  title={family.rationale}
                  className="py-3 flex flex-wrap items-baseline gap-x-2"
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
                  <span className="w-full text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {family.rationale}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function MatrixRow({
  component: c,
  families,
}: {
  component: AlignmentComponent;
  families: AlignmentFamily[];
}) {
  const required = c.classification === 'required_shared';
  const family = c.familyId ? families.find((f) => f.id === c.familyId) : null;

  return (
    <tr>
      <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
        {c.react ? (
          <ActionLink href={githubComponentUrl('react', c.name)}>{c.name}</ActionLink>
        ) : c.reactNative ? (
          <ActionLink href={githubComponentUrl('reactNative', c.name)}>{c.name}</ActionLink>
        ) : (
          c.name
        )}
      </td>
      <td className="px-6 py-3 text-gray-600 dark:text-gray-300">
        <span title={family?.rationale}>{classificationLabel(c.classification)}</span>
        {family && (
          <span className="block text-xs text-gray-400 dark:text-gray-500">{family.label}</span>
        )}
      </td>
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
