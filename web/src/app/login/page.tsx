'use client';

import {
  FormEvent,
  Suspense,
  useEffect,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import {
  getAccessToken,
  setAccessToken,
} from '@/lib/auth/auth';
import { API_BASE_URL } from '@/lib/constants';

type AuthResponse = {
  accessToken: string;
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] =
    useState('');

  const [isLoading, setIsLoading] =
    useState(false);

  const [isGuestLoading, setIsGuestLoading] =
    useState(false);

  const [error, setError] = useState('');

  const returnTo =
    searchParams.get('returnTo');

  const destination =
    returnTo &&
    returnTo.startsWith('/') &&
    !returnTo.startsWith('//')
      ? returnTo
      : '/';

  useEffect(() => {
    if (getAccessToken()) {
      router.replace(destination);
    }
  }, [destination, router]);

  const completeLogin = (
    accessToken: string,
  ) => {
    setAccessToken(accessToken);
    router.replace(destination);
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/login`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            email,
            password,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          'Invalid email or password',
        );
      }

      const data =
        (await response.json()) as AuthResponse;

      completeLogin(data.accessToken);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to sign in',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsGuestLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/demo`,
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        throw new Error(
          'Demo access is currently unavailable',
        );
      }

      const data =
        (await response.json()) as AuthResponse;

      completeLogin(data.accessToken);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to start demo',
      );
    } finally {
      setIsGuestLoading(false);
    }
  };

  const isBusy =
    isLoading || isGuestLoading;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-sm font-semibold text-blue-600">
            EWAP
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Sign in to EWAP
          </h1>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Access your engineering workflow
            workspace.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
              disabled={isBusy}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
              disabled={isBusy}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading
              ? 'Signing in...'
              : 'Sign in'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200" />

          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            or
          </span>

          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={isBusy}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGuestLoading
            ? 'Opening demo...'
            : 'Continue as Guest'}
        </button>

        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          Guest access uses a read-only demo
          workspace.
        </p>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400">
          Engineering Workflow Automation
          Platform
        </p>
      </div>
    </main>
  );
}

function LoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-500">
          Loading...
        </p>
      </div>
    </main>
  );
}