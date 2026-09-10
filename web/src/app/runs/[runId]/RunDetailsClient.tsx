'use client';
import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
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
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  logs: WorkflowExecutionLog[];
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
    
    useEffect(() => {
        const socket = io('http://localhost:3000', {
            transports: ['websocket'],
        });

        socket.on('connect', () => {
            console.log('🔌 Run Details WebSocket connected:', socket.id);
        });

        socket.on('workflow.status.changed', (data) => {
            console.log('📡 Run Details status:', data);

            console.log('Page run ID:', run.id);
            console.log('Event run ID:', data.runId);

            if (data.runId !== run.id) {
            console.log('⏭️ Ignoring event for another run');
            return;
            }

            setCurrentRun((current) => ({
            ...current,
            status: data.status,
            }));
        });

        socket.on('connect_error', (error) => {
            console.error(
            '❌ Run Details WebSocket error:',
            error.message,
            );
        });

        return () => {
            socket.disconnect();
        };
    }, [run.id]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 text-slate-900">
      {/* Header */}
      <div>
        <p className="text-sm font-medium text-blue-600">
          Execution
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Workflow Run
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Run ID: {currentRun.id}
        </p>
      </div>

      {/* Run summary */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-slate-500">Status</p>

            <p
              className={`mt-1 font-semibold ${
                {
                  SUCCESS: 'text-green-600',
                  FAILED: 'text-red-600',
                  RUNNING: 'text-blue-600',
                  PENDING: 'text-amber-600',
                  CANCELLED: 'text-slate-500',
                }[currentRun.status]
              }`}
            >
              {currentRun.status}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Workflow ID</p>

            <p className="mt-1 break-all text-sm font-medium">
              {currentRun.workflowId}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Started</p>

            <p className="mt-1 text-sm font-medium">
              {new Date(currentRun.createdAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                })}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Completed</p>

            <p className="mt-1 text-sm font-medium">
              {currentRun.completedAt
                ? new Date(currentRun.completedAt).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                })
                : 'Still running'}
            </p>
          </div>
        </div>
      </div>

      {/* AI Assistant */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>

              <h2 className="text-lg font-semibold">
                AI Engineering Assistant
              </h2>

              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                Gemini
              </span>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Investigate this workflow run using its execution data.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAiOpen((open) => !open)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            {isAiOpen ? 'Close AI' : 'Ask AI'}
          </button>
        </div>

        {isAiOpen && (
          <AiAssistant runId={currentRun.id} />
        )}
      </div>

      {/* Logs */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">
          Execution Logs
        </h2>

        <div className="mt-5 space-y-3">
          {currentRun.logs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No execution logs available.
            </p>
          ) : (
            currentRun.logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold">
                    {log.level}
                  </span>

                  <span className="text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    })}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-700">
                  {log.message}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}