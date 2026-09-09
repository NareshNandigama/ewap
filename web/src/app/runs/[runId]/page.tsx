import { API_BASE_URL } from '@/lib/constants';
import RunDetailsClient from './RunDetailsClient';

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

type RunDetailsPageProps = {
  params: Promise<{
    runId: string;
  }>;
};

export default async function RunDetailsPage({
  params,
}: RunDetailsPageProps) {
  const { runId } = await params;

  const response = await fetch(
    `${API_BASE_URL}/workflow-runs/${runId}`,
    {
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch workflow run');
  }

  const run: WorkflowRun = await response.json();

  return <RunDetailsClient run={run} />;
}
