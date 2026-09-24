'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { apiRequest } from '@/lib/api/client';

type Project = {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

type Workflow = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export default function ProjectDetailsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [project, setProject] = useState<Project | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [name, setName] = useState('');

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [projectData, workflowData] = await Promise.all([
        apiRequest<Project>(`/projects/${projectId}`),
        apiRequest<Workflow[]>(
          `/projects/${projectId}/workflows`,
        ),
      ]);

      setProject(projectData);
      setWorkflows(workflowData);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to load project',
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  async function handleCreateWorkflow(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const workflowName = name.trim();

    if (!workflowName) {
      setError('Workflow name is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const workflow = await apiRequest<Workflow>(
        `/projects/${projectId}/workflows`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: workflowName,
          }),
        },
      );

      setWorkflows((current) => [
        workflow,
        ...current,
      ]);

      setName('');
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to create workflow',
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
        Loading project...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/projects"
          className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          ← Back to projects
        </Link>

        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-blue-600">
          Project
        </p>

        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          {project?.name ?? 'Project'}
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {project?.description ||
            'Manage this project and its engineering workflows.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreateWorkflow}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-slate-950">
          Create Workflow
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Add an engineering workflow to this project.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label
              htmlFor="workflow-name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Workflow name
            </label>

            <input
              id="workflow-name"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Production Deployment"
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="self-end rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Workflow'}
          </button>
        </div>
      </form>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Workflows
          </h2>

          <p className="mt-1 text-sm text-slate-600">
            Workflows configured for this project.
          </p>
        </div>

        {workflows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              No workflows yet. Create the first workflow above.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/workflows/${workflow.id}`}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <h3 className="text-lg font-semibold text-slate-950">
                  {workflow.name}
                </h3>

                <p className="mt-2 text-xs text-slate-500">
                  Created{' '}
                  {new Date(
                    workflow.createdAt,
                  ).toLocaleDateString()}
                </p>

                <div className="mt-5 text-sm font-semibold text-slate-700">
                  View workflow →
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}