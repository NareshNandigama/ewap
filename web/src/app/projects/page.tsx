'use client';

import { FormEvent, useEffect, useState } from 'react';
import { API_BASE_URL, ORGANIZATION_ID } from '@/lib/constants';

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

  async function fetchProjects() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/organizations/${ORGANIZATION_ID}/projects`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data: Project[] = await response.json();
      setProjects(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/organizations/${ORGANIZATION_ID}/projects`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const newProject: Project = await response.json();

      setProjects((currentProjects) => [
        newProject,
        ...currentProjects,
      ]);

      setName('');
      setDescription('');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Something went wrong',
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Projects
        </h1>

        <p className="mt-2 text-gray-500">
          Manage your engineering projects and workflows.
        </p>
      </div>

      {/* Create Project */}
      <form
        onSubmit={handleCreateProject}
        className="rounded-xl border bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">
          Create Project
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            className="rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-black"
          />

          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            className="rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <button
          type="submit"
          disabled={creating}
          className="mt-4 rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Project'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Projects */}
      {loading && (
        <div className="rounded-xl border bg-white p-8">
          Loading projects...
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="rounded-xl border bg-white p-8 text-gray-500">
          No projects found.
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <h2 className="text-xl font-semibold">
                {project.name}
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                {project.description || 'No description'}
              </p>

              <div className="mt-6 text-xs text-gray-400">
                Created{' '}
                {new Date(project.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}