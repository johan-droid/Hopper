import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import { Zap, Github, ArrowRight, ShieldCheck } from 'lucide-react';
import { GithubIcon } from '../../../components/ui/primitives';

export const LandingFooter: React.FC = () => {
  return (
    <footer className="border-t border-hairline/70 bg-canvas text-ink antialiased">
      {/* Final Call to Action Block */}
      <div className="border-b border-hairline/60 bg-gradient-to-b from-raised/30 to-canvas py-16 sm:py-20 text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-950/20 px-3 py-1 text-xs font-mono text-rose-300">
            <Zap className="h-3.5 w-3.5 text-rose-400" />
            <span>CONNECT IN SECONDS VIA GITHUB APP</span>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Stop debugging CI blind. Move your development forward.
          </h2>

          <p className="mx-auto max-w-xl text-sm sm:text-base text-ink-secondary leading-relaxed">
            Connect Hopper to your repositories. When tests fail, receive actionable root causes and verified code diffs directly on your pull request within 15 seconds.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Link
              to={ROUTES.login}
              className="group flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-neutral-950 shadow-lg shadow-white/5 transition-all hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <GithubIcon className="h-4 w-4 text-neutral-950" />
              <span>Continue with GitHub</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 text-neutral-950" />
            </Link>

            <Link
              to={ROUTES.investigations}
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-hairline bg-raised/70 px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-raised"
            >
              <span>Try Investigation Sandbox</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Structured Footer Navigation */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Brand Column */}
          <div className="md:col-span-4 space-y-4">
            <Link
              to={ROUTES.landing}
              className="flex items-center gap-2.5 text-base font-bold tracking-tight text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-sm ring-1 ring-white/10">
                <Zap className="h-4 w-4" aria-hidden />
              </span>
              <span>Hopper</span>
            </Link>

            <p className="text-xs text-ink-secondary leading-relaxed max-w-sm">
              Next-Generation CI/CD Failure Diagnosis Engine & Unified SDLC Lifecycle Runner. Named after Rear Admiral Grace Hopper.
            </p>

            <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
              <span>Apache-2.0 License</span>
              <span>·</span>
              <span>PostgreSQL 16 + pgvector</span>
            </div>
          </div>

          {/* Product Links */}
          <div className="md:col-span-2 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-white font-semibold">
              Product
            </h4>
            <ul className="space-y-2 text-xs text-ink-secondary">
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  How it Works
                </a>
              </li>
              <li>
                <a href="#problem" className="hover:text-white transition-colors">
                  The Problem
                </a>
              </li>
              <li>
                <a href="#preview" className="hover:text-white transition-colors">
                  Interactive Sandbox
                </a>
              </li>
              <li>
                <a href="#architecture" className="hover:text-white transition-colors">
                  Control Plane State
                </a>
              </li>
            </ul>
          </div>

          {/* Architecture Links */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-white font-semibold">
              Architecture & Docs
            </h4>
            <ul className="space-y-2 text-xs text-ink-secondary">
              <li>
                <a href="#integrations" className="hover:text-white transition-colors">
                  Verified Integrations
                </a>
              </li>
              <li>
                <span className="text-ink-muted">Durable Outbox Queue</span>
              </li>
              <li>
                <span className="text-ink-muted">SHA-256 Cloud Moat</span>
              </li>
              <li>
                <span className="text-ink-muted">Bayesian Flakiness Engine</span>
              </li>
              <li>
                <span className="text-ink-muted">Multi-Provider LLM Router</span>
              </li>
            </ul>
          </div>

          {/* Security & Governance */}
          <div className="md:col-span-3 space-y-3">
            <h4 className="text-xs font-mono uppercase tracking-wider text-white font-semibold">
              Security & Trust
            </h4>
            <ul className="space-y-2 text-xs text-ink-secondary">
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Deterministic Secret Scrubbing</span>
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>PostgreSQL Row-Level Security</span>
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>HMAC Constant-Time Verification</span>
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Single-Agent Governance</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-hairline/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
          <div>
            © {new Date().getFullYear()} Hopper Engineering. Built for engineers who refuse to waste hours scrolling CI logs.
          </div>

          <div className="flex items-center gap-4">
            <Link to={ROUTES.login} className="hover:text-white transition-colors">
              GitHub Auth Gateway
            </Link>
            <span>·</span>
            <a
              href="https://github.com/johan-droid/Hopper"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <Github className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
