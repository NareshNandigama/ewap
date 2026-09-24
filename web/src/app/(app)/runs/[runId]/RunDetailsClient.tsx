'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

import {
  useWorkflowUpdates,
  type WorkflowStatusUpdate,
} from '@/hooks/useWorkflowUpdates';

import AiAssistant from './AiAssistant';

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

type RunDetailsClientProps = {
  run: WorkflowRun;
};

export default function RunDetailsClient({
  run,
}: RunDetailsClientProps) {
  const [currentRun, setCurrentRun] = useState(run);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const handleStatusChange = useCallback(
    (update: WorkflowStatusUpdate) => {
      if (update.runId !== run.id) {
        return;
      }

      setCurrentRun((current) => ({
        ...current,
        status: update.status,
      }));
    },
    [run.id],
  );

  useWorkflowUpdates({
    onStatusChange: handleStatusChange,
  });

  function getStatusClass() {
    switch (currentRun.status) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-700';

      case 'FAILED':
        return 'bg-red-100 text-red-700';

      case 'RUNNING':
        return 'bg-blue-100 text-blue-700';

      case 'CANCELLED':
        return 'bg-slate-100 text-slate-600';

      case 'PENDING':
      default:
        return 'bg-amber-100 text-amber-700';
    }
  }

  function getLogLevelClass(
    level: WorkflowExecutionLog['level'],
  ) {
    switch (level) {
      case 'SUCCESS':
        return 'bg-green-100 text-green-700';

      case 'ERROR':
        return 'bg-red-100 text-red-700';

      case 'WARN':
        return 'bg-amber-100 text-amber-700';

      case 'INFO':
      default:
        return 'bg-blue-100 text-blue-700';
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={
            currentRun.workflow
              ? `/workflows/${currentRun.workflow.id}`
              : '/runs'
          }
          className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          ←{' '}
          {currentRun.workflow
            ? 'Back to workflow'
            : 'Back to runs'}
        </Link>

        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-blue-600">
          Run Details
        </p>

        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              {currentRun.workflow?.name ?? 'Workflow Run'}
            </h1>

            <p className="mt-2 break-all font-mono text-xs text-slate-500">
              Run ID: {currentRun.id}
            </p>
          </div>

          <span
            className={`inline-flex w-fit shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusClass()}`}
          >
            {currentRun.status}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Run Summary
        </h2>

        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-slate-500">
              Status
            </p>

            <span
              className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass()}`}
            >
              {currentRun.status}
            </span>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Workflow
            </p>

            {currentRun.workflow ? (
              <Link
                href={`/workflows/${currentRun.workflow.id}`}
                className="mt-1 block text-sm font-semibold text-slate-800 transition hover:text-blue-600"
              >
                {currentRun.workflow.name}
              </Link>
            ) : (
              <p className="mt-1 break-all text-sm font-medium text-slate-800">
                {currentRun.workflowId}
              </p>
            )}
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Started
            </p>

            <p className="mt-1 text-sm font-medium text-slate-800">
              {new Date(
                currentRun.createdAt,
              ).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              })}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">
              Completed
            </p>

            <p className="mt-1 text-sm font-medium text-slate-800">
              {currentRun.completedAt
                ? new Date(
                    currentRun.completedAt,
                  ).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                  })
                : 'Not completed'}
            </p>
          </div>
        </div>

        {currentRun.workflow?.project && (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-sm text-slate-500">
              Project
            </p>

            <Link
              href={`/projects/${currentRun.workflow.project.id}`}
              className="mt-1 inline-block text-sm font-semibold text-slate-800 transition hover:text-blue-600"
            >
              {currentRun.workflow.project.name}
            </Link>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-950">
                AI Engineering Assistant
              </h2>

              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                Gemini
              </span>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Investigate this workflow run using its execution
              data.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setIsAiOpen((open) => !open)
            }
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {isAiOpen ? 'Close AI' : 'Ask AI'}
          </button>
        </div>

        {isAiOpen && (
          <div className="mt-6 border-t border-slate-200 pt-6">
            <AiAssistant runId={currentRun.id} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Execution Logs
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Runtime events recorded during this workflow
            execution.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {currentRun.logs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
              <p className="text-sm text-slate-500">
                No execution logs available.
              </p>
            </div>
          ) : (
            currentRun.logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${getLogLevelClass(
                      log.level,
                    )}`}
                  >
                    {log.level}
                  </span>

                  <span className="text-xs text-slate-400">
                    {new Date(
                      log.createdAt,
                    ).toLocaleString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                    })}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {log.message}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}