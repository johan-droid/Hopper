import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import { useSession } from '../../auth/useSession';
import { useHealthQuery } from '../../../api/hooks';
import { Badge } from '../../../components/ui/primitives';
import { Zap, Menu, X, ArrowRight, Activity, Github } from 'lucide-react';

export const LandingNavigation: React.FC = () => {
  const { isAuthenticated } = useSession();
  const { data: health, isSuccess, isError } = useHealthQuery();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isHealthy = isSuccess && health?.status === 'healthy';

  return (
    <header className="sticky top-0 z-40 border-b border-hairline/70 bg-canvas/80 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <div className="flex items-center gap-6">
          <Link
            to={ROUTES.landing}
            className="group flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg p-1"
            aria-label="Hopper Home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-md shadow-rose-950/50 ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-105">
              <Zap className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-semibold text-base tracking-tight text-white">Hopper</span>
            <Badge tone="neutral" mono className="text-[10px] uppercase tracking-wider hidden sm:inline-flex">
              v2.0
            </Badge>
          </Link>

          {/* Real Backend Status Badge */}
          <a
            href="#architecture"
            className="hidden lg:inline-flex items-center gap-2 rounded-full border border-hairline/60 bg-raised/60 px-2.5 py-1 text-[11px] text-ink-secondary hover:text-white transition-colors"
            title="Inspect real-time backend state"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthy
                  ? 'bg-emerald-400 animate-pulse'
                  : isError
                  ? 'bg-neutral-500'
                  : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span className="font-mono text-[10px] uppercase">
              {isHealthy ? 'Engine Healthy' : isError ? 'Backend Standby' : 'Connecting...'}
            </span>
          </a>
        </div>

        {/* Desktop Navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-ink-secondary" aria-label="Main Navigation">
          <a href="#how-it-works" className="transition-colors hover:text-white">
            How it Works
          </a>
          <a href="#problem" className="transition-colors hover:text-white">
            The Problem
          </a>
          <a href="#preview" className="transition-colors hover:text-white">
            Product Preview
          </a>
          <a href="#architecture" className="transition-colors hover:text-white">
            Architecture
          </a>
          <a href="#integrations" className="transition-colors hover:text-white">
            Integrations
          </a>
          <a href="#pricing" className="transition-colors hover:text-white">
            Pricing
          </a>
          <a
            href="/puter/"
            className="flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors font-mono"
            title="Zero-cost in-browser AI edition powered by Puter.js"
          >
            <span>Puter AI</span>
            <span className="text-[9px] px-1 py-0.5 rounded bg-rose-500/10 border border-rose-500/30">Free</span>
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <Link
              to={ROUTES.overview}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline/80 bg-raised/80 px-3.5 py-2 text-xs font-medium text-white hover:bg-raised transition-colors focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <Activity className="h-3.5 w-3.5 text-rose-400" />
              <span>Open Console</span>
            </Link>
          ) : (
            <Link
              to={ROUTES.login}
              className="text-xs font-medium text-ink-secondary hover:text-white px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg"
            >
              Sign In
            </Link>
          )}

          <Link
            to={isAuthenticated ? ROUTES.overview : ROUTES.login}
            className="group relative inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-semibold text-neutral-950 shadow-sm transition-all duration-200 hover:bg-neutral-100 hover:shadow-rose-500/10 focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <span>{isAuthenticated ? 'Go to Dashboard' : 'Get Started'}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 text-neutral-950" />
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-hairline p-2 text-ink-secondary hover:text-white focus-visible:ring-2 focus-visible:ring-rose-500"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-hairline bg-canvas/95 px-4 pt-3 pb-6 md:hidden backdrop-blur-xl">
          <nav className="flex flex-col space-y-3 text-sm font-medium text-ink-secondary">
            <a
              href="#how-it-works"
              className="py-1.5 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              How it Works
            </a>
            <a
              href="#problem"
              className="py-1.5 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              The Problem
            </a>
            <a
              href="#preview"
              className="py-1.5 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Product Preview
            </a>
            <a
              href="#architecture"
              className="py-1.5 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Architecture & State
            </a>
            <a
              href="#integrations"
              className="py-1.5 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Integrations
            </a>
            <a
              href="#pricing"
              className="py-1.5 transition-colors hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </a>
            <a
              href="/puter/"
              className="py-1.5 transition-colors text-rose-400 flex items-center justify-between"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>Puter AI Browser Edition</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">Free</span>
            </a>

            <div className="pt-3 border-t border-hairline flex flex-col gap-2">
              <Link
                to={ROUTES.login}
                className="flex items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-xs font-semibold text-neutral-950"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Github className="h-4 w-4" />
                <span>{isAuthenticated ? 'Open Dashboard' : 'Continue with GitHub'}</span>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};
