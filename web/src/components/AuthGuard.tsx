'use client';

import {
  useEffect,
  useState,
} from 'react';

import { usePathname } from 'next/navigation';

import { getAccessToken } from '@/lib/auth/auth';

export default function AuthGuard({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const [isAuthenticated, setIsAuthenticated] =
    useState<boolean | null>(null);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      const returnTo = encodeURIComponent(
        pathname || '/',
      );

      window.location.replace(
        `/login?returnTo=${returnTo}`,
      );

      return;
    }

    setIsAuthenticated(true);
  }, [pathname]);

  if (isAuthenticated !== true) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">
          Loading workspace...
        </p>
      </main>
    );
  }

  return children;
}