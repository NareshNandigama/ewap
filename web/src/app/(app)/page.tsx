'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { apiRequest } from '@/lib/api/client';
import { getOrganizationId } from '@/lib/auth/auth';

type Project = {
  id: string;
};

type Workflow = {
  id: string;
};

type WorkflowRun = {
  id: string;
  status:
    | 'PENDING'
    | 'RUNNING'
    | 'SUCCESS'
    | 'FAILED'
    | 'CANCELLED';
};

export default function Home() {
  const [projectCount, setProjectCount] = useState(0);
  const [workflowCount, setWorkflowCount] = useState(0);
  const [runCount, setRunCount] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        setError('');

        const organizationId = getOrganizationId();

        if (!organizationId) {
          setError('Please sign in to view your workspace.');
          return;
        }

        const [projects, workflows, runs] =
          await Promise.all([
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
        setRunCount(runs.length);
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

  const stats = [
    {
      label: 'Projects',
      value: projectCount,
      description: 'Active engineering projects',
    },
    {
      label: 'Workflows',
      value: workflowCount,
      description: 'Configured workflows',
    },
    {
      label: 'Workflow Runs',
      value: runCount,
      description: 'Total executions',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Dashboard
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          Workspace Overview
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Monitor your projects, workflows, and workflow executions.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">
              {stat.label}
            </p>

            <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
              {isLoading ? '—' : stat.value}
            </p>

            <p className="mt-2 text-sm text-slate-500">
              {stat.description}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">
          Quick Actions
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Get started with your engineering workflows.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/projects"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            View Projects
          </Link>

          <Link
            href="/workflows"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Workflows
          </Link>

          <Link
            href="/runs"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Runs
          </Link>
        </div>
      </div>
    </div>
  );
}