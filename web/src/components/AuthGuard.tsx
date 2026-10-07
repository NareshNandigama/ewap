'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

import { getAccessToken } from '@/lib/auth/auth';

function subscribe() {
  return () => {};
}

export default function AuthGuard({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const isHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const accessToken = isHydrated
    ? getAccessToken()
    : null;

  useEffect(() => {
    if (!isHydrated || accessToken) {
      return;
    }

    const returnTo = encodeURIComponent(
      pathname || '/',
    );

    window.location.replace(
      `/login?returnTo=${returnTo}`,
    );
  }, [accessToken, isHydrated, pathname]);

  if (!isHydrated || !accessToken) {
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