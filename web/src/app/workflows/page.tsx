'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/constants';
import { io } from 'socket.io-client';

const PROJECT_ID =
  'c297ac01-07c6-4661-b306-8f511e658997';

type Workflow = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

type WorkflowRun = {
  id: string;
  workflowId: string;
  createdAt: string;
  completedAt: string | null;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Record<string, WorkflowRun>>({});
  const [loading, setLoading] = useState(true);
  const [runningWorkflow, setRunningWorkflow] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWorkflows() {
      try {
        const response = await fetch(
          `${API_BASE_URL}/projects/${PROJECT_ID}/workflows`,
        );

        if (!response.ok) {
          throw new Error('Failed to fetch workflows');
        }

        const data: Workflow[] = await response.json();

        setWorkflows(data);

        // Load latest run for each workflow
        for (const workflow of data) {
          const runsResponse = await fetch(
            `${API_BASE_URL}/workflows/${workflow.id}/runs`,
          );

          if (runsResponse.ok) {
            const workflowRuns: WorkflowRun[] =
              await runsResponse.json();

            if (workflowRuns.length > 0) {
              setRuns((current) => ({
                ...current,
                [workflow.id]: workflowRuns[0],
              }));
            }
          }
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Something went wrong',
        );
      } finally {
        setLoading(false);
      }
    }

    fetchWorkflows();
  }, []);

  useEffect(() => {
    const socket = io('http://localhost:3000');

    socket.on('connect', () => {
      console.log('🔌 WebSocket connected:', socket.id);
    });

    socket.on('workflow.status.changed', (data) => {
      console.log('📡 Workflow status:', data);

      setRuns((current) => {
        const existingRun = Object.values(current).find(
          (run) => run.id === data.runId,
        );

        if (!existingRun) {
          return current;
        }

        return {
          ...current,
          [existingRun.workflowId]: {
            ...existingRun,
            status: data.status,
          },
        };
      });

      if (
        data.status === 'SUCCESS' ||
        data.status === 'FAILED' ||
        data.status === 'CANCELLED'
      ) {
        setRunningWorkflow(null);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);
  async function runWorkflow(workflowId: string) {
    try {
      setRunningWorkflow(workflowId);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/workflows/${workflowId}/runs`,
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error('Failed to start workflow');
      }

      const run: WorkflowRun = await response.json();

      setRuns((current) => ({
        ...current,
        [workflowId]: run,
      }));

      // // Poll the backend until the worker finishes.
      // const interval = setInterval(async () => {
      //   const statusResponse = await fetch(
      //     `${API_BASE_URL}/workflow-runs/${run.id}`,
      //   );

      //   if (!statusResponse.ok) {
      //     return;
      //   }

      //   const updatedRun: WorkflowRun =
      //     await statusResponse.json();

      //   setRuns((current) => ({
      //     ...current,
      //     [workflowId]: updatedRun,
      //   }));

      //   if (
      //     updatedRun.status === 'SUCCESS' ||
      //     updatedRun.status === 'FAILED' ||
      //     updatedRun.status === 'CANCELLED'
      //   ) {
      //     clearInterval(interval);
      //     setRunningWorkflow(null);
      //   }
      // }, 1000);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Something went wrong',
      );

      setRunningWorkflow(null);
    }
  }

  function getStatusClass(status?: WorkflowRun['status']) {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-700';

      case 'RUNNING':
        return 'bg-blue-100 text-blue-700';

      case 'FAILED':
        return 'bg-red-100 text-red-700';

      case 'CANCELLED':
        return 'bg-gray-100 text-gray-700';

      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Workflows
        </h1>

        <p className="mt-2 text-gray-500">
          Create and execute engineering workflows.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border bg-white p-8">
          Loading workflows...
        </div>
      )}

      {!loading && workflows.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-gray-500">
          No workflows found.
        </div>
      )}

      {!loading && workflows.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => {
            const run = runs[workflow.id];

            return (
              <div
                key={workflow.id}
                className="rounded-xl border bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {workflow.name}
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                      Project workflow
                    </p>
                  </div>

                  {run && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
                        run.status,
                      )}`}
                    >
                      {run.status}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => runWorkflow(workflow.id)}
                  disabled={runningWorkflow === workflow.id}
                  className="mt-6 w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runningWorkflow === workflow.id
                    ? 'Running...'
                    : '▶ Run Workflow'}
                </button>

                {run && (
                  <div className="mt-4 text-xs text-gray-400">
                    Last run:{' '}
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}