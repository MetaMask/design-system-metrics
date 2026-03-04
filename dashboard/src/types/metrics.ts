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
