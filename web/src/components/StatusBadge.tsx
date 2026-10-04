type WorkflowRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

type StatusBadgeProps = {
  status: WorkflowRunStatus;
};

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

export default function StatusBadge({
  status,
}: Readonly<StatusBadgeProps>) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(
        status,
      )}`}
    >
      {status}
    </span>
  );
}

export type { WorkflowRunStatus };