'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useWorkflowUpdates } from '@/hooks/useWorkflowUpdates';
import { apiRequest } from '@/lib/api/client';

type WorkflowRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

type WorkflowRun = {
  id: string;
  workflowId: string;
  createdAt: string;
  completedAt: string | null;
  status: WorkflowRunStatus;

  workflow: {
    id: string;
    name: string;

    project: {
      id: string;
      name: string;
    };
  };
};

export default function RunsPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRuns() {
      try {
        setLoading(true);
        setError(null);

        const data =
          await apiRequest<WorkflowRun[]>('/workflow-runs');

        setRuns(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load workflow runs',
        );
      } finally {
        setLoading(false);
      }
    }

    loadRuns();
  }, []);

  const handleStatusChange = useCallback(
    (data: {
      runId: string;
      status: WorkflowRunStatus;
    }) => {
      setRuns((current) =>
        current.map((run) =>
          run.id === data.runId
            ? {
                ...run,
                status: data.status,
              }
            : run,
        ),
      );
    },
    [],
  );

  useWorkflowUpdates({
    onStatusChange: handleStatusChange,
  });

  function getStatusClass(status: WorkflowRunStatus) {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-700';

      case 'RUNNING':
        return 'bg-blue-100 text-blue-700';

      case 'FAILED':
        return 'bg-red-100 text-red-700';

      case 'CANCELLED':
        return 'bg-slate-100 text-slate-600';

      case 'PENDING':
      default:
        return 'bg-amber-100 text-amber-700';
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Runs
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          Workflow Runs
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Monitor workflow executions across all of your projects.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">
            Loading workflow runs...
          </p>
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            No workflow runs yet
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Run a workflow and its execution history will appear
            here.
          </p>

          <Link
            href="/workflows"
            className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            View workflows
          </Link>
        </div>
      )}

      {!loading && !error && runs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[1fr_1fr_180px_140px] gap-6 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
            <div>Workflow</div>
            <div>Project</div>
            <div>Started</div>
            <div>Status</div>
          </div>

          <div className="divide-y divide-slate-200">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="grid gap-4 px-6 py-5 transition hover:bg-slate-50 md:grid-cols-[1fr_1fr_180px_140px] md:items-center md:gap-6"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">
                    {run.workflow.name}
                  </p>

                  <p className="mt-1 truncate font-mono text-xs text-slate-400">
                    {run.id}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {run.workflow.project.name}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-slate-600">
                    {new Date(
                      run.createdAt,
                    ).toLocaleString()}
                  </p>
                </div>

                <div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                      run.status,
                    )}`}
                  >
                    {run.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}