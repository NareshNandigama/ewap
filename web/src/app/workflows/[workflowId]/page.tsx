'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '@/lib/api/client';

type Workflow = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

type WorkflowRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

type WorkflowRun = {
  id: string;
  workflowId: string;
  status: WorkflowRunStatus;
  createdAt: string;
  completedAt: string | null;
};

export default function WorkflowDetailsPage() {
  const params = useParams<{ workflowId: string }>();
  const workflowId = params.workflowId;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingRun, setCreatingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflow = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [workflowData, runsData] = await Promise.all([
        apiRequest<Workflow>(`/workflows/${workflowId}`),
        apiRequest<WorkflowRun[]>(
          `/workflows/${workflowId}/runs`,
        ),
      ]);

      setWorkflow(workflowData);
      setRuns(runsData);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to load workflow',
      );
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void loadWorkflow();
  }, [loadWorkflow]);

  async function handleRunWorkflow() {
    try {
      setCreatingRun(true);
      setError(null);

      const run = await apiRequest<WorkflowRun>(
        `/workflows/${workflowId}/runs`,
        {
          method: 'POST',
        },
      );

      setRuns((currentRuns) => [
        run,
        ...currentRuns,
      ]);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to run workflow',
      );
    } finally {
      setCreatingRun(false);
    }
  }

  function statusClasses(status: WorkflowRunStatus) {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300';

      case 'FAILED':
        return 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300';

      case 'RUNNING':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';

      case 'CANCELLED':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

      default:
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300';
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        Loading workflow...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        {workflow && (
          <Link
            href={`/projects/${workflow.projectId}`}
            className="text-sm text-gray-600 hover:underline dark:text-gray-400"
          >
            ← Back to project
          </Link>
        )}

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {workflow?.name ?? 'Workflow'}
            </h1>

            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Monitor workflow executions and investigate individual runs.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunWorkflow}
            disabled={creatingRun}
            className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
          >
            {creatingRun ? 'Starting...' : 'Run Workflow'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">
            Workflow Runs
          </h2>

          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Recent executions for this workflow.
          </p>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400">
              This workflow has not been executed yet.
            </p>

            <button
              type="button"
              onClick={handleRunWorkflow}
              disabled={creatingRun}
              className="mt-4 text-sm font-medium underline underline-offset-4 disabled:opacity-50"
            >
              Run it now
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex flex-col gap-3 border-b border-gray-200 p-5 transition last:border-b-0 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:hover:bg-gray-800/50"
              >
                <div>
                  <div className="font-mono text-sm">
                    {run.id}
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Started{' '}
                    {new Date(
                      run.createdAt,
                    ).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${statusClasses(
                      run.status,
                    )}`}
                  >
                    {run.status}
                  </span>

                  <span className="text-sm font-medium">
                    View run →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}