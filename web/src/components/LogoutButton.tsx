'use client';

import { useRouter } from 'next/navigation';

import { clearAccessToken } from '@/lib/auth/auth';

export default function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    clearAccessToken();
    router.replace('/login');
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
    >
      Logout
    </button>
  );
}