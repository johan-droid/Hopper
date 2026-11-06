import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from '../ui/CommandPalette';

export const AppShell: React.FC = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:text-xs focus:text-ink"
      >
        Skip to content
      </a>

      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main id="main-content" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="border-t border-hairline px-4 py-3 text-[10px] text-ink-muted md:px-6">
          Hopper — CI/CD failure diagnosis · Supabase · Vercel
        </footer>
      </div>

      <CommandPalette />
    </div>
  );
};
