'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';

import { apiRequest } from '@/lib/api/client';
import { getOrganizationId } from '@/lib/auth/auth';

type Project = {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const organizationId = getOrganizationId();

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiRequest<Project[]>(
        `/organizations/${organizationId}/projects`,
      );

      setProjects(data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to load projects',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  async function handleCreateProject(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const newProject = await apiRequest<Project>(
        `/organizations/${organizationId}/projects`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
          }),
        },
      );

      setProjects((currentProjects) => [
        newProject,
        ...currentProjects,
      ]);

      setName('');
      setDescription('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to create project';

      if (message.includes('401')) {
        setError('Your session has expired. Please log in again.');
      } else if (message.includes('403')) {
        setError(
          'You do not have permission to create projects.',
        );
      } else {
        setError(message);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Projects
        </h1>

        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your engineering projects and workflows.
        </p>
      </div>

      <form
        onSubmit={handleCreateProject}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold">
          Create Project
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="project-name"
              className="mb-2 block text-sm font-medium"
            >
              Project name
            </label>

            <input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Customer Platform"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-500 dark:focus:ring-gray-800"
            />
          </div>

          <div>
            <label
              htmlFor="project-description"
              className="mb-2 block text-sm font-medium"
            >
              Description
            </label>

            <input
              id="project-description"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Customer-facing engineering platform"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-500 focus:ring-2 focus:ring-gray-200 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-gray-500 dark:focus:ring-gray-800"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={creating}
          className="mt-5 rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
        >
          {creating ? 'Creating...' : 'Create Project'}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          Loading projects...
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          No projects yet. Create your first project above.
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <h2 className="text-xl font-semibold">
                {project.name}
              </h2>

              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                {project.description || 'No description'}
              </p>

              <div className="mt-6 text-xs text-gray-500">
                Created{' '}
                {new Date(
                  project.createdAt,
                ).toLocaleDateString()}
              </div>

              <div className="mt-4 text-sm font-medium">
                View workflows →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}