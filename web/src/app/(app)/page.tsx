'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  type BarShapeProps,
  CartesianGrid,
  Pie,
  PieChart,
  type PieSectorDataItem,
  Rectangle,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiRequest } from '@/lib/api/client';
import { getOrganizationId } from '@/lib/auth/auth';

type Project = {
  id: string;
};

type Workflow = {
  id: string;
};

type WorkflowRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

type WorkflowRun = {
  id: string;
  status: WorkflowRunStatus;
};

type ChartType =
  | 'donut'
  | 'bar'
  | 'horizontal'
  | 'pie';

type StatusConfig = {
  label: string;
  color: string;
  dotClassName: string;
  backgroundClassName: string;
  textClassName: string;
};

const STATUS_CONFIG: Record<
  WorkflowRunStatus,
  StatusConfig
> = {
  PENDING: {
    label: 'Pending',
    color: '#f59e0b',
    dotClassName: 'bg-amber-500',
    backgroundClassName: 'bg-amber-50',
    textClassName: 'text-amber-700',
  },
  RUNNING: {
    label: 'Running',
    color: '#3b82f6',
    dotClassName: 'bg-blue-500',
    backgroundClassName: 'bg-blue-50',
    textClassName: 'text-blue-700',
  },
  SUCCESS: {
    label: 'Success',
    color: '#22c55e',
    dotClassName: 'bg-green-500',
    backgroundClassName: 'bg-green-50',
    textClassName: 'text-green-700',
  },
  FAILED: {
    label: 'Failed',
    color: '#ef4444',
    dotClassName: 'bg-red-500',
    backgroundClassName: 'bg-red-50',
    textClassName: 'text-red-700',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: '#94a3b8',
    dotClassName: 'bg-slate-400',
    backgroundClassName: 'bg-slate-100',
    textClassName: 'text-slate-600',
  },
};

const STATUSES = Object.keys(
  STATUS_CONFIG,
) as WorkflowRunStatus[];

const CHART_OPTIONS: {
  value: ChartType;
  label: string;
}[] = [
  {
    value: 'donut',
    label: 'Donut',
  },
  {
    value: 'bar',
    label: 'Bar',
  },
  {
    value: 'horizontal',
    label: 'Horizontal',
  },
  {
    value: 'pie',
    label: 'Pie',
  },
];

function StatusSector(props: PieSectorDataItem) {
  const status =
    props.payload?.status as WorkflowRunStatus;

  return (
    <Sector
      {...props}
      fill={STATUS_CONFIG[status].color}
    />
  );
}

function StatusBar(props: BarShapeProps) {
  const status =
    props.payload?.status as WorkflowRunStatus;

  return (
    <Rectangle
      {...props}
      fill={STATUS_CONFIG[status].color}
      radius={[5, 5, 0, 0]}
    />
  );
}

function HorizontalStatusBar(
  props: BarShapeProps,
) {
  const status =
    props.payload?.status as WorkflowRunStatus;

  return (
    <Rectangle
      {...props}
      fill={STATUS_CONFIG[status].color}
      radius={[0, 5, 5, 0]}
    />
  );
}

export default function Home() {
  const [projectCount, setProjectCount] =
    useState(0);

  const [workflowCount, setWorkflowCount] =
    useState(0);

  const [runs, setRuns] = useState<
    WorkflowRun[]
  >([]);

  const [chartType, setChartType] =
    useState<ChartType>('donut');

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        setError('');

        const organizationId =
          getOrganizationId();

        if (!organizationId) {
          setError(
            'Please sign in to view your workspace.',
          );
          return;
        }

        const [
          projects,
          workflows,
          workflowRuns,
        ] = await Promise.all([
          apiRequest<Project[]>(
            `/organizations/${organizationId}/projects`,
          ),
          apiRequest<Workflow[]>('/workflows'),
          apiRequest<WorkflowRun[]>(
            '/workflow-runs',
          ),
        ]);

        setProjectCount(projects.length);
        setWorkflowCount(workflows.length);
        setRuns(workflowRuns);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Unable to load dashboard',
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadStats();
  }, []);

  const runStatusData = useMemo(() => {
    return STATUSES.map((status) => ({
      status,
      label:
        STATUS_CONFIG[status].label,
      runs: runs.filter(
        (run) => run.status === status,
      ).length,
    }));
  }, [runs]);

  const statusCounts = useMemo(() => {
    return runStatusData.reduce(
      (counts, item) => {
        counts[item.status] = item.runs;

        return counts;
      },
      {
        PENDING: 0,
        RUNNING: 0,
        SUCCESS: 0,
        FAILED: 0,
        CANCELLED: 0,
      } as Record<
        WorkflowRunStatus,
        number
      >,
    );
  }, [runStatusData]);

  const completedRuns =
    statusCounts.SUCCESS +
    statusCounts.FAILED;

  const successRate =
    completedRuns === 0
      ? 0
      : Math.round(
          (statusCounts.SUCCESS /
            completedRuns) *
            100,
        );

  const stats = [
    {
      label: 'Projects',
      value: projectCount,
      description:
        'Active engineering projects',
    },
    {
      label: 'Workflows',
      value: workflowCount,
      description: 'Configured workflows',
    },
    {
      label: 'Total Runs',
      value: runs.length,
      description: 'Workflow executions',
    },
    {
      label: 'Success Rate',
      value: `${successRate}%`,
      description: 'Of completed runs',
    },
  ];

  function renderChart() {
    if (chartType === 'bar') {
      return (
        <BarChart
          data={runStatusData}
          barCategoryGap="12%"
          margin={{
            top: 5,
            right: 8,
            left: -22,
            bottom: 0,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#e2e8f0"
          />

          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            fontSize={10}
          />

          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            fontSize={10}
          />

          <Tooltip />

          <Bar
            dataKey="runs"
            shape={StatusBar}
            maxBarSize={72}
          />
        </BarChart>
      );
    }

    if (chartType === 'horizontal') {
      return (
        <BarChart
          data={runStatusData}
          layout="vertical"
          margin={{
            top: 2,
            right: 18,
            left: 5,
            bottom: 0,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="#e2e8f0"
          />

          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            fontSize={10}
          />

          <YAxis
            type="category"
            dataKey="label"
            width={68}
            tickLine={false}
            axisLine={false}
            fontSize={10}
          />

          <Tooltip />

          <Bar
            dataKey="runs"
            shape={HorizontalStatusBar}
            maxBarSize={22}
          />
        </BarChart>
      );
    }

    if (chartType === 'pie') {
      return (
        <PieChart>
          <Pie
            data={runStatusData}
            dataKey="runs"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={82}
            paddingAngle={2}
            shape={StatusSector}
          />

          <Tooltip />
        </PieChart>
      );
    }

    return (
      <PieChart>
        <Pie
          data={runStatusData}
          dataKey="runs"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={52}
          outerRadius={78}
          paddingAngle={3}
          shape={StatusSector}
        />

        <Tooltip />
      </PieChart>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Dashboard
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
            Workspace Overview
          </h1>

          <p className="mt-0.5 text-sm text-slate-600">
            Monitor your engineering workflows
            and execution health.
          </p>
        </div>

        <Link
          href="/runs"
          className="inline-flex w-fit items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          View all runs
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>

            <div className="mt-1 flex items-end justify-between gap-2">
              <p className="text-2xl font-bold tracking-tight text-slate-950">
                {isLoading
                  ? '—'
                  : stat.value}
              </p>

              <p className="pb-0.5 text-right text-xs text-slate-500">
                {stat.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Analytics */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        {/* Chart */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                Run Status Distribution
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                Workflow execution status
                distribution.
              </p>
            </div>

            {/* Chart Type Switcher */}
            <div className="flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {CHART_OPTIONS.map(
                (option) => {
                  const isActive =
                    chartType ===
                    option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setChartType(
                          option.value,
                        )
                      }
                      className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex h-52 items-center justify-center">
              <p className="text-sm text-slate-500">
                Loading workflow
                analytics...
              </p>
            </div>
          ) : runs.length === 0 ? (
            <div className="flex h-52 items-center justify-center">
              <p className="text-sm text-slate-500">
                No workflow run data
                available yet.
              </p>
            </div>
          ) : (
            <div className="mt-1 grid items-center gap-2 md:grid-cols-[1fr_190px]">
              {/* Chart */}
              <div className="relative h-52 min-w-0">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  {renderChart()}
                </ResponsiveContainer>

                {/* Donut Center */}
                {chartType ===
                  'donut' && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-2xl font-bold tracking-tight text-slate-950">
                        {runs.length}
                      </p>

                      <p className="text-[11px] font-medium text-slate-500">
                        Total Runs
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="space-y-0.5">
                {runStatusData.map(
                  (item) => {
                    const config =
                      STATUS_CONFIG[
                        item.status
                      ];

                    const percentage =
                      runs.length === 0
                        ? 0
                        : Math.round(
                            (item.runs /
                              runs.length) *
                              100,
                          );

                    return (
                      <div
                        key={item.status}
                        className="flex items-center justify-between rounded-lg px-2 py-1.5 transition hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${config.dotClassName}`}
                          />

                          <span className="text-xs font-medium text-slate-700">
                            {
                              config.label
                            }
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-sm font-semibold text-slate-950">
                            {item.runs}
                          </span>

                          <span className="ml-1.5 text-[11px] text-slate-400">
                            {percentage}%
                          </span>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}
        </section>

        {/* Execution Health */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Execution Health
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              Current workflow execution
              activity.
            </p>
          </div>

          <div className="mt-3 space-y-1.5">
            {runStatusData.map(
              (item) => {
                const config =
                  STATUS_CONFIG[
                    item.status
                  ];

                const percentage =
                  runs.length === 0
                    ? 0
                    : Math.round(
                        (item.runs /
                          runs.length) *
                          100,
                      );

                return (
                  <div
                    key={item.status}
                    className={`rounded-lg ${config.backgroundClassName} px-3 py-2`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${config.dotClassName}`}
                        />

                        <p
                          className={`text-xs font-semibold ${config.textClassName}`}
                        >
                          {
                            config.label
                          }
                        </p>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <p
                          className={`text-base font-bold ${config.textClassName}`}
                        >
                          {item.runs}
                        </p>

                        <span
                          className={`text-[11px] ${config.textClassName}`}
                        >
                          {percentage}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/70">
                      <div
                        className={`h-full rounded-full ${config.dotClassName}`}
                        style={{
                          width: `${percentage}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              },
            )}
          </div>

          {/* Completion Summary */}
          <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-slate-500">
                  Completed
                </p>

                <p className="text-sm font-semibold text-slate-950">
                  {completedRuns} runs
                </p>
              </div>

              <div className="text-right">
                <p className="text-[11px] font-medium text-slate-500">
                  Success rate
                </p>

                <p className="text-lg font-bold text-green-600">
                  {successRate}%
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Quick Actions */}
      <section className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              Quick Actions
            </h2>

            <p className="text-xs text-slate-500">
              Navigate to your engineering
              workspace.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/projects"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              View Projects
            </Link>

            <Link
              href="/workflows"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View Workflows
            </Link>

            <Link
              href="/runs"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View Runs
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}