import { useState, useEffect } from 'react';
import type { MetricsData, TimelineData, IndexData } from '../types/metrics';

const BASE_PATH = import.meta.env.BASE_URL || '/';
const METRICS_PATH = `${BASE_PATH}metrics/`;

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
        const indexRes = await fetch(`${METRICS_PATH}index.json`);
        if (!indexRes.ok) throw new Error('Failed to fetch index');
        const index: IndexData = await indexRes.json();

        const latestFile = index.latest[project];
        if (!latestFile) throw new Error(`No data available for ${project}`);

        // Fetch the latest data file
        const dataRes = await fetch(`${METRICS_PATH}${latestFile}`);
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
        const res = await fetch(`${METRICS_PATH}timeline.json`);
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
        const res = await fetch(`${METRICS_PATH}index.json`);
        if (!res.ok) throw new Error('Failed to fetch index');
        const index: IndexData = await index.json();
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
