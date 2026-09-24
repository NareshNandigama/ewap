'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import RunDetailsClient from './RunDetailsClient';
import { apiRequest } from '@/lib/api/client';

type WorkflowExecutionLog = {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  metadata: unknown;
  createdAt: string;
};

type WorkflowRun = {
  id: string;
  workflowId: string;
  createdAt: string;
  completedAt: string | null;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'SUCCESS'
    | 'FAILED'
    | 'CANCELLED';
  logs: WorkflowExecutionLog[];
  workflow?: {
    id: string;
    name: string;
    project: {
      id: string;
      name: string;
    };
  };
};

export default function RunDetailsPage() {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;

  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRun() {
      try {
        setLoading(true);
        setError(null);

        const data = await apiRequest<WorkflowRun>(
          `/workflow-runs/${runId}`,
        );

        setRun(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load workflow run',
        );
      } finally {
        setLoading(false);
      }
    }

    if (runId) {
      loadRun();
    }
  }, [runId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Loading workflow run...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!run) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Workflow run not found.
      </div>
    );
  }

  return <RunDetailsClient run={run} />;
}