export interface ComponentMetrics {
  name: string;
  mmdsInstances: number;
  deprecatedInstances: number;
  totalInstances: number;
  replacement: string | null;
  migrationPercentage: string;
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
