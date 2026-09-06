const stats = [
  {
    label: 'Projects',
    value: '0',
    description: 'Active engineering projects',
  },
  {
    label: 'Workflows',
    value: '0',
    description: 'Configured workflows',
  },
  {
    label: 'Workflow Runs',
    value: '0',
    description: 'Total executions',
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl">
      {/* Page heading */}
      <div>
        <p className="text-sm font-medium text-blue-600">Overview</p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Welcome to EWAP
        </h1>

        <p className="mt-2 max-w-2xl text-slate-500">
          Engineering Workflow Automation Platform for managing and
          executing engineering workflows.
        </p>
      </div>

      {/* Stats */}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">
              {stat.label}
            </p>

            <p className="mt-3 text-3xl font-bold tracking-tight">
              {stat.value}
            </p>

            <p className="mt-2 text-sm text-slate-400">
              {stat.description}
            </p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Quick Actions</h2>

        <p className="mt-1 text-sm text-slate-500">
          Get started with your engineering workflows.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="/projects"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            View Projects
          </a>

          <a
            href="/workflows"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Workflows
          </a>

          <a
            href="/runs"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Runs
          </a>
        </div>
      </div>
    </div>
  );
}