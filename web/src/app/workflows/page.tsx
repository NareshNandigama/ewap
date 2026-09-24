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
};

type Project = {
  id: string;
  name: string;
};

type Workflow = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  project: Project;
  runs: WorkflowRun[];
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningWorkflow, setRunningWorkflow] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkflows() {
      try {
        setLoading(true);
        setError(null);

        const data =
          await apiRequest<Workflow[]>('/workflows');

        setWorkflows(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load workflows',
        );
      } finally {
        setLoading(false);
      }
    }

    loadWorkflows();
  }, []);

  const handleStatusChange = useCallback(
    (data: {
      runId: string;
      status: WorkflowRunStatus;
    }) => {
      setWorkflows((current) =>
        current.map((workflow) => {
          const latestRun = workflow.runs[0];

          if (!latestRun || latestRun.id !== data.runId) {
            return workflow;
          }

          return {
            ...workflow,
            runs: [
              {
                ...latestRun,
                status: data.status,
              },
              ...workflow.runs.slice(1),
            ],
          };
        }),
      );

      if (
        data.status === 'SUCCESS' ||
        data.status === 'FAILED' ||
        data.status === 'CANCELLED'
      ) {
        setRunningWorkflow(null);
      }
    },
    [],
  );

  useWorkflowUpdates({
    onStatusChange: handleStatusChange,
  });

  async function runWorkflow(workflowId: string) {
    try {
      setRunningWorkflow(workflowId);
      setError(null);

      const run = await apiRequest<WorkflowRun>(
        `/workflows/${workflowId}/runs`,
        {
          method: 'POST',
        },
      );

      setWorkflows((current) =>
        current.map((workflow) =>
          workflow.id === workflowId
            ? {
                ...workflow,
                runs: [run],
              }
            : workflow,
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to start workflow',
      );

      setRunningWorkflow(null);
    }
  }

  function getStatusClass(status: WorkflowRunStatus) {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-700';

      case 'RUNNING':
        return 'bg-blue-100 text-blue-700';

      case 'FAILED':
        return 'bg-red-100 text-red-700';

      case 'CANCELLED':
        return 'bg-gray-100 text-gray-700';

      case 'PENDING':
      default:
        return 'bg-amber-100 text-amber-700';
    }
  }

  return (
    <div className="space-y-8 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Workflows
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          View and execute engineering workflows across your
          projects.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Loading workflows...
        </div>
      )}

      {!loading && workflows.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            No workflows yet
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Open a project to create your first engineering
            workflow.
          </p>

          <Link
            href="/projects"
            className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            View projects
          </Link>
        </div>
      )}

      {!loading && workflows.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => {
            const latestRun = workflow.runs[0];
            const isRunning =
              runningWorkflow === workflow.id;

            return (
              <div
                key={workflow.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/workflows/${workflow.id}`}
                      className="text-lg font-semibold text-slate-900 transition hover:text-slate-600"
                    >
                      {workflow.name}
                    </Link>

                    <Link
                      href={`/projects/${workflow.project.id}`}
                      className="mt-1 block truncate text-sm text-slate-500 transition hover:text-slate-900"
                    >
                      {workflow.project.name}
                    </Link>
                  </div>

                  {latestRun && (
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                        latestRun.status,
                      )}`}
                    >
                      {latestRun.status}
                    </span>
                  )}
                </div>

                <div className="mt-6 flex-1">
                  {latestRun ? (
                    <div className="space-y-1 text-sm text-slate-500">
                      <p>Latest run</p>

                      <Link
                        href={`/runs/${latestRun.id}`}
                        className="inline-block font-medium text-slate-700 hover:text-slate-900"
                      >
                        {new Date(
                          latestRun.createdAt,
                        ).toLocaleString()}
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      This workflow has not been run yet.
                    </p>
                  )}
                </div>

                <div className="mt-6 flex gap-3">
                  <Link
                    href={`/workflows/${workflow.id}`}
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    View details
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      runWorkflow(workflow.id)
                    }
                    disabled={isRunning}
                    className="flex-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isRunning ? 'Starting...' : 'Run workflow'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}