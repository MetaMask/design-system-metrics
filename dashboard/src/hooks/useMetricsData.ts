import { useState, useEffect } from 'react';
import type {
  MetricsData,
  TimelineData,
  IndexData,
  ComponentPropsAuditData,
  ComponentPropsAuditIndexData,
  MigrationTargetsData,
  UntrackedData,
  UntrackedTimeline,
} from '../types/metrics';

const BASE_PATH = import.meta.env.BASE_URL || '/';
const METRICS_PATH = `${BASE_PATH}metrics/`;

/**
 * Metrics files live at stable URLs whose contents change every pipeline run,
 * so always revalidate rather than serving a cached snapshot.
 */
function fetchMetrics(fileName: string): Promise<Response> {
  return fetch(`${METRICS_PATH}${fileName}`, { cache: 'no-cache' });
}

export function useMetricsData(project?: 'mobile' | 'extension') {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!project) return;

    const fetchData = async () => {
      try {
        setLoading(true);

        // First, get the index to find the latest file
        const indexRes = await fetchMetrics('index.json');
        if (!indexRes.ok) throw new Error('Failed to fetch index');
        const index: IndexData = await indexRes.json();

        const latestFile = index.latest[project];
        if (!latestFile) throw new Error(`No data available for ${project}`);

        // Fetch the latest data file
        const dataRes = await fetchMetrics(latestFile);
        if (!dataRes.ok) throw new Error(`Failed to fetch ${latestFile}`);
        const metricsData: MetricsData = await dataRes.json();

        setData(metricsData);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [project]);

  return { data, loading, error };
}

export function useTimelineData() {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetchMetrics('timeline.json');
        if (!res.ok) throw new Error('Failed to fetch timeline');
        const timeline: TimelineData = await res.json();
        setData(timeline);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useIndexData() {
  const [data, setData] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetchMetrics('index.json');
        if (!res.ok) throw new Error('Failed to fetch index');
        const index: IndexData = await res.json();
        setData(index);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useComponentPropsAudit(componentName: string) {
  const [data, setData] = useState<ComponentPropsAuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const fileName = `${componentName.toLowerCase()}-props-audit-latest.json`;
        const res = await fetchMetrics(fileName);

        // Optional dataset: no file yet should not be treated as a hard error.
        if (res.status === 404) {
          setData(null);
          setError(null);
          return;
        }

        if (!res.ok) throw new Error(`Failed to fetch ${fileName}`);
        const audit: ComponentPropsAuditData = await res.json();
        setData(audit);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [componentName]);

  return { data, loading, error };
}

export function useComponentPropsAuditIndex() {
  const [data, setData] = useState<ComponentPropsAuditIndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const fileName = 'component-props-audit-index.json';
        const res = await fetchMetrics(fileName);

        if (res.status === 404) {
          setData(null);
          setError(null);
          return;
        }

        if (!res.ok) throw new Error(`Failed to fetch ${fileName}`);
        const auditIndex: ComponentPropsAuditIndexData = await res.json();
        setData(auditIndex);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
}

export function useUntrackedData(project: 'mobile' | 'extension') {
  const [data, setData] = useState<UntrackedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const fileName = `${project}-untracked-latest.json`;
        const res = await fetchMetrics(fileName);

        // Optional dataset: return null without error when file is missing.
        if (res.status === 404) {
          setData(null);
          setError(null);
          return;
        }

        if (!res.ok) throw new Error(`Failed to fetch ${fileName}`);
        const untracked: UntrackedData = await res.json();
        setData(untracked);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [project]);

  return { data, loading, error };
}

export function useUntrackedTimeline() {
  const [data, setData] = useState<UntrackedTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetchMetrics('untracked-timeline.json');
        if (res.status === 404) { setData(null); setError(null); return; }
        if (!res.ok) throw new Error('Failed to fetch untracked-timeline.json');
        setData(await res.json());
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return { data, loading, error };
}

export function useMigrationTargets() {
  const [data, setData] = useState<MigrationTargetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const fileName = 'migration-targets.json';
        const res = await fetchMetrics(fileName);

        // Optional dataset: dashboard should still render if this file is missing.
        if (res.status === 404) {
          setData(null);
          setError(null);
          return;
        }

        if (!res.ok) throw new Error(`Failed to fetch ${fileName}`);
        const migrationTargets: MigrationTargetsData = await res.json();
        setData(migrationTargets);
        setError(null);
      } catch (err) {
        setError(err as Error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
}
