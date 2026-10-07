'use client';

import Link from 'next/link';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import StatusBadge, {
  type WorkflowRunStatus,
} from '@/components/StatusBadge';
import { useWorkflowUpdates } from '@/hooks/useWorkflowUpdates';
import { apiRequest } from '@/lib/api/client';

type StatusFilter = WorkflowRunStatus | 'ALL';

type WorkflowRun = {
  id: string;
  workflowId: string;
  createdAt: string;
  completedAt: string | null;
  status: WorkflowRunStatus;

  workflow: {
    id: string;
    name: string;

    project: {
      id: string;
      name: string;
    };
  };
};

export default function RunsPage() {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('ALL');

  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'started',
      desc: true,
    },
  ]);

  useEffect(() => {
    async function loadRuns() {
      try {
        setLoading(true);
        setError(null);

        const data =
          await apiRequest<WorkflowRun[]>('/workflow-runs');

        setRuns(data);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load workflow runs',
        );
      } finally {
        setLoading(false);
      }
    }

    loadRuns();
  }, []);

  const handleStatusChange = useCallback(
    (data: {
      runId: string;
      status: WorkflowRunStatus;
    }) => {
      setRuns((current) =>
        current.map((run) =>
          run.id === data.runId
            ? {
                ...run,
                status: data.status,
              }
            : run,
        ),
      );
    },
    [],
  );

  useWorkflowUpdates({
    onStatusChange: handleStatusChange,
  });

  const normalizedSearchQuery =
    searchQuery.trim().toLowerCase();

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      const matchesSearch =
        !normalizedSearchQuery ||
        run.workflow.name
          .toLowerCase()
          .includes(normalizedSearchQuery) ||
        run.workflow.project.name
          .toLowerCase()
          .includes(normalizedSearchQuery) ||
        run.id
          .toLowerCase()
          .includes(normalizedSearchQuery);

      const matchesStatus =
        statusFilter === 'ALL' ||
        run.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [
    runs,
    normalizedSearchQuery,
    statusFilter,
  ]);

  const columns = useMemo<ColumnDef<WorkflowRun>[]>(
    () => [
      {
        id: 'workflow',
        accessorFn: (run) => run.workflow.name,
        header: 'Workflow',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-950">
              {row.original.workflow.name}
            </p>

            <p className="mt-1 truncate font-mono text-xs text-slate-400">
              {row.original.id}
            </p>
          </div>
        ),
      },
      {
        id: 'project',
        accessorFn: (run) => run.workflow.project.name,
        header: 'Project',
        cell: ({ row }) => (
          <p className="text-sm font-medium text-slate-700">
            {row.original.workflow.project.name}
          </p>
        ),
      },
      {
        id: 'started',
        accessorFn: (run) =>
          new Date(run.createdAt).getTime(),
        header: 'Started',
        cell: ({ row }) => (
          <p className="text-sm text-slate-600">
            {new Date(
              row.original.createdAt,
            ).toLocaleString()}
          </p>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} />
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredRuns,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const hasActiveFilters =
    normalizedSearchQuery.length > 0 ||
    statusFilter !== 'ALL';

  function clearFilters() {
    setSearchQuery('');
    setStatusFilter('ALL');
    table.setPageIndex(0);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Runs
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          Workflow Runs
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Monitor workflow executions across all of your
          projects.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">
            Loading workflow runs...
          </p>
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">
            No workflow runs yet
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Run a workflow and its execution history will
            appear here.
          </p>

          <Link
            href="/workflows"
            className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            View workflows
          </Link>
        </div>
      )}

      {!loading && !error && runs.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label
                  htmlFor="run-search"
                  className="sr-only"
                >
                  Search workflow runs
                </label>

                <input
                  id="run-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    table.setPageIndex(0);
                  }}
                  placeholder="Search by workflow, project, or run ID..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="sm:w-48">
                <label
                  htmlFor="status-filter"
                  className="sr-only"
                >
                  Filter by status
                </label>

                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(
                      event.target.value as StatusFilter,
                    );

                    table.setPageIndex(0);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">
                    All statuses
                  </option>

                  <option value="PENDING">
                    Pending
                  </option>

                  <option value="RUNNING">
                    Running
                  </option>

                  <option value="SUCCESS">
                    Success
                  </option>

                  <option value="FAILED">
                    Failed
                  </option>

                  <option value="CANCELLED">
                    Cancelled
                  </option>
                </select>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="text-xs text-slate-500">
                Showing {filteredRuns.length} of{' '}
                {runs.length} runs
              </p>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-blue-600 transition hover:text-blue-700"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {filteredRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <h2 className="text-base font-semibold text-slate-950">
                No matching workflow runs
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Try changing your search or status filter.
              </p>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      {table
                        .getHeaderGroups()
                        .map((headerGroup) => (
                          <tr key={headerGroup.id}>
                            {headerGroup.headers.map(
                              (header) => {
                                const canSort =
                                  header.column.getCanSort();

                                const sorted =
                                  header.column.getIsSorted();

                                return (
                                  <th
                                    key={header.id}
                                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                                  >
                                    {header.isPlaceholder ? null : (
                                      <button
                                        type="button"
                                        disabled={!canSort}
                                        onClick={header.column.getToggleSortingHandler()}
                                        className={
                                          canSort
                                            ? 'inline-flex items-center gap-1 transition hover:text-slate-900'
                                            : ''
                                        }
                                      >
                                        {flexRender(
                                          header.column
                                            .columnDef
                                            .header,
                                          header.getContext(),
                                        )}

                                        {sorted ===
                                          'asc' && (
                                          <span>↑</span>
                                        )}

                                        {sorted ===
                                          'desc' && (
                                          <span>↓</span>
                                        )}
                                      </button>
                                    )}
                                  </th>
                                );
                              },
                            )}
                          </tr>
                        ))}
                    </thead>

                    <tbody className="divide-y divide-slate-200">
                      {table
                        .getRowModel()
                        .rows.map((row) => (
                          <tr
                            key={row.id}
                            className="transition hover:bg-slate-50"
                          >
                            {row
                              .getVisibleCells()
                              .map((cell) => (
                                <td
                                  key={cell.id}
                                  className="px-6 py-5"
                                >
                                  <Link
                                    href={`/runs/${row.original.id}`}
                                    className="block"
                                  >
                                    {flexRender(
                                      cell.column
                                        .columnDef.cell,
                                      cell.getContext(),
                                    )}
                                  </Link>
                                </td>
                              ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Page{' '}
                  <span className="font-semibold text-slate-700">
                    {table.getState().pagination
                      .pageIndex + 1}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold text-slate-700">
                    {table.getPageCount()}
                  </span>
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      table.previousPage()
                    }
                    disabled={
                      !table.getCanPreviousPage()
                    }
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}