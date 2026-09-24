'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Projects', href: '/projects' },
  { name: 'Workflows', href: '/workflows' },
  { name: 'Runs', href: '/runs' },
];

export default function SidebarNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') {
      return pathname === '/';
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="p-4">
      <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Workspace
      </div>

      <div className="space-y-1">
        {navigation.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}