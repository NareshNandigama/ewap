'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import StatusBadge, {
  type WorkflowRunStatus,
} from '@/components/StatusBadge';
import { apiRequest } from '@/lib/api/client';

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

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflow() {
      try {
        const [workflowData, runsData] = await Promise.all([
          apiRequest<Workflow>(`/workflows/${workflowId}`),
          apiRequest<WorkflowRun[]>(
            `/workflows/${workflowId}/runs`,
          ),
        ]);

        if (!cancelled) {
          setWorkflow(workflowData);
          setRuns(runsData);
        }
      } catch (error) {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : 'Unable to load workflow',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWorkflow();

    return () => {
      cancelled = true;
    };
  }, [workflowId]);

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

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
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
            className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            ← Back to project
          </Link>
        )}

        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Workflow
            </p>

            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              {workflow?.name ?? 'Workflow'}
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Monitor workflow executions and investigate
              individual runs.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunWorkflow}
            disabled={creatingRun}
            className="shrink-0 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingRun ? 'Starting...' : 'Run Workflow'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Workflow Runs
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Recent executions for this workflow.
          </p>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              This workflow has not been executed yet.
            </p>

            <button
              type="button"
              onClick={handleRunWorkflow}
              disabled={creatingRun}
              className="mt-4 text-sm font-semibold text-slate-700 underline underline-offset-4 transition hover:text-slate-950 disabled:opacity-50"
            >
              Run it now
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex flex-col gap-3 border-b border-slate-200 p-5 transition last:border-b-0 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm text-slate-700">
                    {run.id}
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Started{' '}
                    {new Date(
                      run.createdAt,
                    ).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <StatusBadge status={run.status} />

                  <span className="text-sm font-semibold text-slate-700">
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