'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { API_BASE_URL } from '@/lib/constants';

const WORKFLOW_ID =
  'd7da009c-388a-40e0-a30a-fb5a554e4b92';

type WorkflowRun = {
  id: string;
  workflowId: string;
  createdAt: string;
  completedAt: string | null;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
};

export default function RunsPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRuns() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${API_BASE_URL}/workflows/${WORKFLOW_ID}/runs`,
        );

        if (!response.ok) {
          throw new Error('Failed to fetch workflow runs');
        }

        const data: WorkflowRun[] = await response.json();

        setRuns(data);
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

    fetchRuns();
  }, []);

  return (
    <div className="mx-auto max-w-7xl">
      <div>
        <p className="text-sm font-medium text-blue-600">
          Execution
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Workflow Runs
        </h1>

        <p className="mt-2 text-slate-500">
          Monitor workflow executions and their status.
        </p>
      </div>

      <div className="mt-8">
        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">
              Loading workflow runs...
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm text-red-600">
              {error}
            </p>
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <h2 className="text-lg font-semibold">
              No workflow runs
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Workflow execution history will appear here.
            </p>
          </div>
        )}

        {!loading && !error && runs.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-200">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between gap-6 p-5"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      Deployment Workflow
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span
                      className={`text-sm font-semibold ${
                        {
                          SUCCESS: 'text-green-600',
                          FAILED: 'text-red-600',
                          RUNNING: 'text-blue-600',
                          PENDING: 'text-amber-600',
                          CANCELLED: 'text-slate-500',
                        }[run.status]
                      }`}
                    >
                      {run.status}
                    </span>

                    <Link
                      href={`/runs/${run.id}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}