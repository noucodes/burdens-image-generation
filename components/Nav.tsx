'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard', icon: '▦' },
  { href: '/audit', label: 'Audit', icon: '◈' },
  { href: '/generate', label: 'Generate', icon: '⬡' },
  { href: '/review', label: 'Review', icon: '◉' },
  { href: '/refine', label: 'Refine', icon: '◎' },
  { href: '/prompts', label: 'Prompts', icon: '✎' },
  { href: '/settings', label: 'Settings', icon: '◐' },
];

export default function Nav() {
  const path = usePathname();

  return (
    <nav className="w-[220px] shrink-0 bg-slate-900 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-slate-800">
        <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-slate-500 mb-0.5">Burdens</p>
        <h1 className="text-white font-semibold text-sm leading-tight">Image Automation</h1>
      </div>

      {/* Links */}
      <div className="flex-1 py-4 space-y-0.5 px-3">
        {links.map(({ href, label, icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800',
              ].join(' ')}
            >
              <span className="text-base leading-none w-4 text-center opacity-70">{icon}</span>
              {label}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800">
        <p className="text-[11px] text-slate-600">Gemini 2.5 Flash Image</p>
        <p className="text-[11px] text-slate-600">Vertex AI · Free tier</p>
      </div>
    </nav>
  );
}
