import AuthGuard from '@/components/AuthGuard';
import LogoutButton from '@/components/LogoutButton';
import SidebarNav from '@/components/SidebarNav';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 self-start border-r border-slate-800 bg-slate-950 text-white md:block">
          <div className="flex h-20 items-center border-b border-slate-800 px-6">
            <div>
              <div className="text-2xl font-bold tracking-tight">
                EWAP
              </div>

              <div className="mt-0.5 text-xs font-medium text-slate-400">
                Workflow Platform
              </div>
            </div>
          </div>

          <SidebarNav />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-6 border-b border-slate-200 bg-white px-6 md:px-8">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 md:text-2xl">
                Engineering Workflow Automation Platform
              </h1>

              <p className="mt-1 hidden text-sm text-slate-500 sm:block">
                Manage, execute, and analyze engineering workflows
              </p>
            </div>

            <div className="shrink-0">
              <LogoutButton />
            </div>
          </header>

          <main className="p-6 md:p-8">
            <div className="mx-auto w-full max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}