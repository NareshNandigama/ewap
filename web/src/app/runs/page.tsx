export default function RunsPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div>
        <p className="text-sm font-medium text-blue-600">Execution</p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Workflow Runs
        </h1>

        <p className="mt-2 text-slate-500">
          Monitor workflow executions and their status.
        </p>
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <h2 className="text-lg font-semibold">No workflow runs</h2>

        <p className="mt-2 text-sm text-slate-500">
          Workflow execution history will appear here.
        </p>
      </div>
    </div>
  );
}