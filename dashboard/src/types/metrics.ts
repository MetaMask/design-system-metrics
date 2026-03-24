export interface ComponentMetrics {
  name: string;
  mmdsInstances: number;
  deprecatedInstances: number;
  totalInstances: number;
  replacement: string | null;
  migrationPercentage: string;
}

export interface CodeOwnerStats {
  mmdsInstances: number;
  deprecatedInstances: number;
  totalInstances: number;
  migrationPercentage: string;
  filesCount: number;
}

export interface MetricsSummary {
  totalComponents: number;
  mmdsInstances: number;
  deprecatedInstances: number;
  totalInstances: number;
  migrationPercentage: string;
  fullyMigrated: number;
  inProgress: number;
  notStarted: number;
  codeOwnerStats?: Record<string, CodeOwnerStats>;
}

export interface MetricsData {
  project: string;
  date: string;
  generatedAt: string;
  summary: MetricsSummary;
  components: ComponentMetrics[];
}

export interface CodeOwnerTimelineEntry {
  migrationPercentage: number[];
  mmdsInstances: number[];
  deprecatedInstances: number[];
  totalInstances: number[];
}

export interface CodeOwnerTimeline {
  dates: string[];
  owners: Record<string, CodeOwnerTimelineEntry>;
}

export interface ProjectTimeline {
  dates: string[];
  migrationPercentage: number[];
  mmdsInstances: number[];
  deprecatedInstances: number[];
  totalInstances: number[];
  componentsFullyMigrated: number[];
  componentsInProgress: number[];
  componentsNotStarted: number[];
  totalComponents: number[];
  mmdsComponentsAvailable: number[];
  mmdsComponentsList: string[][];
  newComponents: string[][];
  codeOwnerTimeline?: CodeOwnerTimeline;
  latestChange?: {
    migrationPercentageChange: string;
    mmdsInstancesChange: number;
    deprecatedInstancesChange: number;
    componentsFullyMigratedChange: number;
    componentsInProgressChange: number;
    mmdsComponentsAvailableChange: number;
  };
}

export interface TimelineData {
  generatedAt: string;
  mobile: ProjectTimeline;
  extension: ProjectTimeline;
  summary: {
    totalWeeks: number;
    dateRange: {
      start: string | null;
      end: string | null;
    };
  };
}

export interface IndexEntry {
  date: string;
  file: string;
}

export interface IndexData {
  lastUpdated: string;
  projects: {
    mobile: IndexEntry[];
    extension: IndexEntry[];
  };
  latest: {
    mobile: string | null;
    extension: string | null;
  };
}

export interface ComponentPropUsage {
  count: number;
  values: Record<string, number>;
}

export interface ComponentPropsAuditBucket {
  totalInstances: number;
  filesCount: number;
  props: Record<string, ComponentPropUsage>;
}

export interface ComponentPropsAuditProject {
  filesScanned: number;
  targetComponent: string;
  mmds: ComponentPropsAuditBucket;
  deprecated: ComponentPropsAuditBucket;
  overall: ComponentPropsAuditBucket;
  deprecatedByLegacyComponent: Record<string, number>;
}

export interface ComponentPropsAuditData {
  component: string;
  generatedAt: string;
  projects: {
    mobile?: ComponentPropsAuditProject;
    extension?: ComponentPropsAuditProject;
    [key: string]: ComponentPropsAuditProject | undefined;
  };
}

export interface ComponentPropsAuditIndexEntry {
  component: string;
  file: string;
  projects: string[];
  generatedAt: string;
}

export interface ComponentPropsAuditIndexData {
  generatedAt: string;
  components: ComponentPropsAuditIndexEntry[];
}

export interface MigrationTargetComponent {
  name: string;
  status?: 'to_do' | 'not_doing' | 'complete';
}

export interface MigrationTargetsProject {
  source: string | null;
  components: Array<string | MigrationTargetComponent>;
}

export interface MigrationTargetsData {
  generatedAt: string;
  mobile: MigrationTargetsProject;
  extension: MigrationTargetsProject;
}

export interface UntrackedMMDSMatch {
  component: string;
  confidence: 'exact' | 'high' | 'medium';
}

export interface UntrackedComponent {
  component: string;
  instances: number;
  fileCount: number;
  importSources: string[];
  mmdsMatches: UntrackedMMDSMatch[];
  /** Dominant import source category for this component. */
  sourceCategory?: 'local-oneoff' | 'platform-primitive' | 'third-party' | 'mixed';
  /** Best single representative import path (normalized, no leading ../). */
  canonicalSource?: string;
  /** Top code owners by instance count (up to 5). */
  codeOwners?: string[];
  /** Per-owner instance counts. */
  codeOwnerBreakdown?: Record<string, number>;
}

export interface UntrackedCodeOwnerSummary {
  replaceableComponents: number;
  futureDSComponents: number;
  replaceableInstances: number;
}

export interface UntrackedSummary {
  filesScanned: number;
  totalJSXUsages: number;
  trackedDeprecated: number;
  trackedMMDS: number;
  untrackedTotal: number;
  uniqueUntrackedComponents: number;
  replaceableNow: number;
  /** Total JSX instances belonging to replaceable components. */
  replaceableInstances?: number;
  futureDSCandidates: number;
  /** Per-team breakdown of replaceable/candidate component counts. */
  codeOwnerBreakdown?: Record<string, UntrackedCodeOwnerSummary>;
}

export interface UntrackedData {
  project: string;
  date: string;
  /** All unique code owner teams found across untracked components. */
  teams?: string[];
  summary: UntrackedSummary;
  replaceableWithMMDS: UntrackedComponent[];
  futureDSCandidates: UntrackedComponent[];
}
