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

  const apiUrl = process.env.EWAP_API_URL;

  if (!apiUrl) {
    throw new Error('EWAP_API_URL is not configured');
  }

  const response = await fetch(
    `${apiUrl}/api/v1/workflow-runs/${runId}`,
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
