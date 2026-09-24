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
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        Loading project...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/projects"
          className="text-sm text-gray-600 hover:underline dark:text-gray-400"
        >
          ← Projects
        </Link>

        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          {project?.name ?? 'Project'}
        </h1>

        {project?.description && (
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {project.description}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreateWorkflow}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold">
          Create Workflow
        </h2>

        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Add an engineering workflow to this project.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label
              htmlFor="workflow-name"
              className="mb-2 block text-sm font-medium"
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
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-500 dark:focus:ring-gray-800"
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="self-end rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
          >
            {creating ? 'Creating...' : 'Create Workflow'}
          </button>
        </div>
      </form>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">
            Workflows
          </h2>

          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Workflows configured for this project.
          </p>
        </div>

        {workflows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-600 dark:border-gray-700 dark:text-gray-400">
            No workflows yet. Create the first workflow above.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <Link
                key={workflow.id}
                href={`/workflows/${workflow.id}`}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <h3 className="font-semibold">
                  {workflow.name}
                </h3>

                <p className="mt-2 text-xs text-gray-500">
                  Created{' '}
                  {new Date(
                    workflow.createdAt,
                  ).toLocaleDateString()}
                </p>

                <div className="mt-5 text-sm font-medium">
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