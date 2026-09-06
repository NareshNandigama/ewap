import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'EWAP',
  description: 'Engineering Workflow Automation Platform',
};

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Projects', href: '/projects' },
  { name: 'Workflows', href: '/workflows' },
  { name: 'Runs', href: '/runs' },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="hidden w-64 border-r border-slate-800 bg-slate-950 text-white md:block">
            <div className="flex h-16 items-center border-b border-slate-800 px-6">
              <div>
                <div className="text-xl font-bold tracking-tight">EWAP</div>
                <div className="text-xs text-slate-400">
                  Workflow Platform
                </div>
              </div>
            </div>

            <nav className="p-4">
              <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Workspace
              </div>

              <div className="space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </nav>
          </aside>

          {/* Main area */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
              <div>
                <span className="text-sm font-medium text-slate-500">
                  Engineering Workflow Automation
                </span>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                N
              </div>
            </header>

            <main className="flex-1 p-6 md:p-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}