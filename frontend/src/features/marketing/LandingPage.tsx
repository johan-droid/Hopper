'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Github,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Zap,
  GitPullRequest,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  Lock,
  Unlock,
  Activity,
  Bell,
  Layers,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Code2,
  Menu,
  X,
  FileCode2,
  Fingerprint,
  Play,
  Flame,
  Home,
  CreditCard,
  Download,
  MessageSquare,
  Workflow,
  Radio,
  TrendingUp,
  BarChart3,
  Gauge,
} from 'lucide-react';

// ============================================================================
// GLOBAL STYLES, MATTE DESIGN TOKENS, MICRO-GRAIN & KEYFRAMES
// ============================================================================
const GlobalStyles = () => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    :root {
      color-scheme: dark;
      --bg-obsidian: #08090d;
      --surface-matte: #0e111a;
      --surface-inset: #05060a;
      --surface-raised: #121622;
      --border-matte: rgba(255, 255, 255, 0.08);
      --border-matte-subtle: rgba(255, 255, 255, 0.04);
      --border-matte-hover: rgba(255, 255, 255, 0.16);
    }

    html {
      scroll-behavior: smooth;
      background-color: #08090d;
      color: #e2e8f0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background-color: #08090d;
      overflow-x: hidden;
      margin: 0;
    }

    .font-mono-code {
      font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .tracking-obsidian {
      letter-spacing: -0.035em;
    }

    /* Subtle matte film grain texture overlay */
    .film-grain {
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
    }

    /* Matte metallic text sweep */
    @keyframes matte-shine {
      0% { background-position: 140% 0; }
      100% { background-position: -140% 0; }
    }
    .matte-shiny-text {
      background: linear-gradient(
        115deg,
        #64748b 25%,
        #f8fafc 48%,
        #34d399 53%,
        #64748b 75%
      );
      background-size: 240% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: matte-shine 4.2s linear infinite;
    }

    /* Matte bioluminescent shimmer */
    @keyframes matte-gradient-flow {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .matte-gradient-text {
      background: linear-gradient(95deg, #10b981 0%, #06b6d4 35%, #8b5cf6 70%, #10b981 100%);
      background-size: 260% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: matte-gradient-flow 6s ease infinite;
    }

    /* StarBorder orbiting comet beam */
    @keyframes comet-spin {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
    .comet-beam {
      animation: comet-spin 3.8s linear infinite;
    }

    /* Kinetic rotating text */
    @keyframes rotate-enter {
      0% {
        opacity: 0;
        transform: translateY(60%) scale(0.95);
        filter: blur(4px);
      }
      100% {
        opacity: 1;
        transform: translateY(0%) scale(1);
        filter: blur(0px);
      }
    }
    .rotate-enter {
      animation: rotate-enter 0.48s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    /* Infinite seamless logo marquee */
    @keyframes marquee-flow {
      0% { transform: translate3d(0, 0, 0); }
      100% { transform: translate3d(-50%, 0, 0); }
    }
    .marquee-track {
      display: flex;
      width: max-content;
      animation: marquee-flow 34s linear infinite;
    }
    .marquee-container:hover .marquee-track {
      animation-play-state: paused;
    }
    .matte-edge-fade {
      mask-image: linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%);
      -webkit-mask-image: linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%);
    }

    /* Pulse beam in pipeline connector */
    @keyframes pulse-beam {
      0% { transform: translateX(-100%); opacity: 0; }
      20% { opacity: 1; }
      80% { opacity: 1; }
      100% { transform: translateX(220%); opacity: 0; }
    }
    .pulse-beam {
      animation: pulse-beam 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }

    /* Blur text entrance animation */
    @keyframes blur-reveal {
      0% {
        opacity: 0.2;
        filter: blur(8px);
        transform: translate3d(0, 10px, 0);
      }
      100% {
        opacity: 1;
        filter: blur(0px);
        transform: translate3d(0, 0, 0);
      }
    }
    .blur-reveal-word {
      animation: blur-reveal 0.52s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    /* Floating toast */
    @keyframes toast-slide-in {
      0% { opacity: 0; transform: translate3d(24px, -12px, 0) scale(0.96); }
      100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
    }
    .animate-toast-in {
      animation: toast-slide-in 0.34s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    /* Refined Matte Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #08090d;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(16, 185, 129, 0.4);
    }
  `,
    }}
  />
);

// ============================================================================
// MICRO-INTERACTION #1: ClickSpark (8-ray micro-spark burst on click)
// ============================================================================
const ClickSpark: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<Array<{ x: number; y: number; angle: number; startTime: number; color: string }>>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const palette = ['#10B981', '#06B6D4', '#E2E8F0', '#34D399'];
    const duration = 400;
    const sparkCount = 8;
    const sparkRadius = 22;
    const sparkSize = 8;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = now - spark.startTime;
        if (elapsed >= duration) return false;

        const t = elapsed / duration;
        const eased = 1 - Math.pow(1 - t, 3);
        const dist = eased * sparkRadius;
        const len = sparkSize * (1 - eased);

        const x1 = spark.x + dist * Math.cos(spark.angle);
        const y1 = spark.y + dist * Math.sin(spark.angle);
        const x2 = spark.x + (dist + len) * Math.cos(spark.angle);
        const y2 = spark.y + (dist + len) * Math.sin(spark.angle);

        ctx.strokeStyle = spark.color;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        return true;
      });

      ctx.globalAlpha = 1;
      if (sparksRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(draw);
      } else {
        rafRef.current = null;
      }
    };

    const onClick = (e: MouseEvent) => {
      const now = performance.now();
      for (let i = 0; i < sparkCount; i++) {
        sparksRef.current.push({
          x: e.clientX,
          y: e.clientY,
          angle: (Math.PI * 2 * i) / sparkCount + (Math.random() * 0.2 - 0.1),
          startTime: now,
          color: palette[i % palette.length],
        });
      }
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(draw);
      }
    };

    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', onClick);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full">
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-30 h-full w-full bg-transparent"
        aria-hidden="true"
      />
      {children}
    </div>
  );
};

// ============================================================================
// MATTE MESH BACKGROUND (Subdued Bioluminescent Aurora + Interactive Dot Grid)
// ============================================================================
const MatteMeshBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: -999, y: -999, targetX: -999, targetY: -999, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;
    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        mouseRef.current.targetX = x;
        mouseRef.current.targetY = y;
        mouseRef.current.active = true;
      } else {
        mouseRef.current.active = false;
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    const render = (ts: number) => {
      const t = ts * 0.0003;
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.1;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.1;

      ctx.clearRect(0, 0, width, height);

      // Matte atmospheric fields (deep subdued tones, not harsh bright glow)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const fields = [
        {
          x: width * (0.22 + 0.1 * Math.sin(t * 0.8)),
          y: height * (0.16 + 0.06 * Math.cos(t * 0.6)),
          r: Math.max(width * 0.42, 340),
          c0: 'rgba(16, 185, 129, 0.11)',
          c1: 'rgba(16, 185, 129, 0)',
        },
        {
          x: width * (0.78 + 0.08 * Math.cos(t * 0.7)),
          y: height * (0.18 + 0.07 * Math.sin(t * 0.9)),
          r: Math.max(width * 0.4, 320),
          c0: 'rgba(6, 182, 212, 0.09)',
          c1: 'rgba(6, 182, 212, 0)',
        },
        {
          x: width * (0.5 + 0.12 * Math.sin(t * 0.5 + 1.5)),
          y: height * (0.32 + 0.06 * Math.cos(t * 0.8)),
          r: Math.max(width * 0.36, 300),
          c0: 'rgba(139, 92, 246, 0.08)',
          c1: 'rgba(139, 92, 246, 0)',
        },
      ];

      for (const f of fields) {
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, f.c0);
        g.addColorStop(1, f.c1);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();

      // Precision Dot Grid
      const spacing = 32;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const isActive = mouseRef.current.active;
      const radius = 190;
      const radiusSq = radius * radius;

      for (let x = spacing / 2; x < width; x += spacing) {
        for (let y = spacing / 2; y < height; y += spacing) {
          let alpha = 0.075;
          let size = 0.9;
          let color = '203, 213, 225';

          if (isActive) {
            const dx = x - mx;
            const dy = y - my;
            const dSq = dx * dx + dy * dy;
            if (dSq < radiusSq) {
              const factor = 1 - Math.sqrt(dSq) / radius;
              const smooth = factor * factor;
              alpha = 0.08 + smooth * 0.45;
              size = 0.9 + smooth * 1.2;
              color = smooth > 0.45 ? '16, 185, 129' : '6, 182, 212';
            }
          }

          ctx.fillStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Bottom seamless fade into #08090d
      const fade = ctx.createLinearGradient(0, height * 0.65, 0, height);
      fade.addColorStop(0, 'rgba(8, 9, 13, 0)');
      fade.addColorStop(1, '#08090d');
      ctx.fillStyle = fade;
      ctx.fillRect(0, height * 0.65, width, height * 0.35);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
};

// ============================================================================
// TEXT & ANIMATION COMPONENTS
// ============================================================================
const BlurText: React.FC<{
  text: string;
  className?: string;
  delay?: number;
  startDelay?: number;
  align?: 'center' | 'left';
}> = ({ text, className = '', delay = 45, startDelay = 0, align = 'center' }) => {
  const words = text.split(' ');
  return (
    <span
      className={`inline-flex flex-wrap gap-x-[0.28em] ${
        align === 'center' ? 'justify-center' : 'justify-start'
      } ${className}`}
    >
      {words.map((word, idx) => (
        <span
          key={`${word}-${idx}`}
          style={{
            animationDelay: `${startDelay + idx * delay}ms`,
          }}
          className="blur-reveal-word inline-block will-change-[transform,opacity,filter]"
        >
          {word}
        </span>
      ))}
    </span>
  );
};

const RotatingText: React.FC<{ words: string[]; interval?: number; className?: string }> = ({
  words,
  interval = 2400,
  className = '',
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <span
      className={`relative inline-flex min-w-[11ch] items-center justify-center overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3.5 py-1 align-middle shadow-[0_0_20px_-6px_rgba(16,185,129,0.3)] backdrop-blur-md sm:min-w-[12.2ch] sm:px-4 ${className}`}
    >
      <span
        key={words[index]}
        className="rotate-enter matte-gradient-text inline-block whitespace-nowrap font-extrabold"
      >
        {words[index]}
      </span>
    </span>
  );
};

const ShinyText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <span className={`matte-shiny-text font-medium ${className}`}>{text}</span>
);

const HEX_GLYPHS = '0123456789abcdef_#$*';
const DecryptedText: React.FC<{
  text: string;
  triggerKey?: number;
  className?: string;
  speed?: number;
}> = ({ text, triggerKey, className = '', speed = 22 }) => {
  const [output, setOutput] = useState(text);
  const [hoverCount, setHoverCount] = useState(0);

  useEffect(() => {
    let step = 0;
    const timer = setInterval(() => {
      setOutput(
        text
          .split('')
          .map((ch, idx) => {
            if (ch === ' ' || ch === '•' || ch === ':') return ch;
            if (idx < step) return text[idx];
            return HEX_GLYPHS[Math.floor(Math.random() * HEX_GLYPHS.length)];
          })
          .join('')
      );
      step += 0.75;
      if (step >= text.length) {
        setOutput(text);
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, triggerKey, hoverCount, speed]);

  return (
    <span
      onMouseEnter={() => setHoverCount((c) => c + 1)}
      title="Hover to re-verify cryptographic hash"
      className={`cursor-default font-mono-code ${className}`}
    >
      {output}
    </span>
  );
};

// ============================================================================
// MATTE SPOTLIGHT & TILTED CARDS
// ============================================================================
const SpotlightCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  borderGlowColor?: string;
}> = ({
  children,
  className = '',
  spotlightColor = 'rgba(16, 185, 129, 0.08)',
  borderGlowColor = 'rgba(16, 185, 129, 0.35)',
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0, opacity: 0 });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top, opacity: 1 });
  };

  const handleLeave = () => setCoords((prev) => ({ ...prev, opacity: 0 }));

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1017]/90 shadow-[0_12px_36px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-all duration-300 hover:border-white/[0.16] ${className}`}
    >
      {/* Precision hairline border tracking */}
      <div
        className="pointer-events-none absolute -inset-px rounded-2xl transition-opacity duration-300"
        style={{
          opacity: coords.opacity,
          background: `radial-gradient(340px circle at ${coords.x}px ${coords.y}px, ${borderGlowColor}, transparent 55%)`,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: '1px',
        }}
      />
      {/* Matte surface radial wash */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: coords.opacity,
          background: `radial-gradient(420px circle at ${coords.x}px ${coords.y}px, ${spotlightColor}, transparent 60%)`,
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
};

const TiltedCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
}> = ({ children, className = '', maxTilt = 4 }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState({
    transform: 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)',
  });

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rx = (0.5 - py) * maxTilt * 2;
    const ry = (px - 0.5) * maxTilt * 2;
    setStyle({
      transform: `perspective(1100px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(
        2
      )}deg) scale3d(1.004,1.004,1.004)`,
    });
  };

  const handleLeave = () => {
    setStyle({
      transform: 'perspective(1100px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)',
    });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ transform: style.transform }}
      className={`relative transition-transform duration-200 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
};

const StarBorder: React.FC<{
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  color?: string;
  secondaryColor?: string;
  rounded?: string;
  onClick?: () => void;
}> = ({
  children,
  className = '',
  innerClassName = '',
  color = '#10B981',
  secondaryColor = '#06B6D4',
  rounded = 'rounded-xl',
  onClick,
}) => (
  <div
    onClick={onClick}
    className={`relative inline-flex overflow-hidden p-[1.5px] ${rounded} ${className}`}
  >
    <span
      aria-hidden="true"
      className="comet-beam pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[230%]"
      style={{
        background: `conic-gradient(from 0deg, transparent 0deg, transparent 265deg, ${color} 315deg, ${secondaryColor} 345deg, #ffffff 355deg, transparent 360deg)`,
      }}
    />
    <div
      className={`relative z-10 flex h-full w-full items-center justify-center ${rounded} ${innerClassName}`}
    >
      {children}
    </div>
  </div>
);

const Magnet: React.FC<{
  children: React.ReactNode;
  padding?: number;
  strength?: number;
  className?: string;
}> = ({ children, padding = 38, strength = 0.22, className = '' }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      if (Math.abs(dx) < rect.width / 2 + padding && Math.abs(dy) < rect.height / 2 + padding) {
        setPos({ x: dx * strength, y: dy * strength, active: true });
      } else if (pos.active) {
        setPos({ x: 0, y: 0, active: false });
      }
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [padding, strength, pos.active]);

  return (
    <div
      ref={ref}
      className={`inline-block ${className}`}
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        transition: pos.active
          ? 'transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)'
          : 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {children}
    </div>
  );
};

const CountUp: React.FC<{
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}> = ({ to, decimals = 0, prefix = '', suffix = '', duration = 1400 }) => {
  const [val, setVal] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (to === 0) {
      setVal(0);
      return;
    }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setVal(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {decimals > 0 ? val.toFixed(decimals) : Math.round(val)}
      {suffix}
    </span>
  );
};

const LogoLoop: React.FC<{ items: Array<{ name: string; category: string; dotColor: string }> }> = ({
  items,
}) => (
  <div className="marquee-container matte-edge-fade relative w-full overflow-hidden py-2">
    <div className="marquee-track flex items-center gap-3">
      {[...items, ...items].map((item, idx) => (
        <div
          key={`${item.name}-${idx}`}
          className="flex shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.07] bg-[#0d1017] px-3.5 py-2 backdrop-blur-md transition-colors hover:border-emerald-500/30 hover:bg-[#121622]"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: item.dotColor }}
          />
          <span className="text-xs font-semibold tracking-tight text-zinc-200">{item.name}</span>
          <span className="font-mono-code text-[10px] text-zinc-500">{item.category}</span>
        </div>
      ))}
    </div>
  </div>
);

const Dock: React.FC<{
  items: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    accent?: boolean;
    onClick: () => void;
  }>;
}> = ({ items }) => {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const getScale = (idx: number) => {
    if (mouseX === null) return 1;
    const el = itemRefs.current[idx];
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const dist = Math.abs(mouseX - center);
    const maxDist = 110;
    if (dist > maxDist) return 1;
    const ratio = Math.cos(((dist / maxDist) * Math.PI) / 2);
    return 1 + ratio * 0.38;
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 hidden justify-center md:flex">
      <nav
        aria-label="Quick section navigation"
        onMouseMove={(e) => setMouseX(e.clientX)}
        onMouseLeave={() => {
          setMouseX(null);
          setHoveredIdx(null);
        }}
        className="pointer-events-auto flex items-end gap-2 rounded-2xl border border-white/[0.1] bg-[#0c0e15]/85 px-3 py-2 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-2xl"
      >
        {items.map((item, idx) => {
          const Icon = item.icon;
          const scale = getScale(idx);
          const translateY = (scale - 1) * -12;

          return (
            <div
              key={item.label}
              ref={(el) => { itemRefs.current[idx] = el; }}
              onMouseEnter={() => setHoveredIdx(idx)}
              className="relative flex flex-col items-center"
            >
              {hoveredIdx === idx && (
                <div className="pointer-events-none absolute -top-9 whitespace-nowrap rounded-lg border border-white/12 bg-[#0d1017]/95 px-2 py-0.5 font-mono-code text-[11px] font-medium text-white shadow-xl backdrop-blur-md">
                  {item.label}
                </div>
              )}

              <button
                type="button"
                onClick={item.onClick}
                aria-label={item.label}
                style={{
                  transform: `translate3d(0, ${translateY.toFixed(1)}px, 0) scale(${scale.toFixed(
                    3
                  )})`,
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors duration-150 will-change-transform ${
                  item.accent
                    ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.08] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
};

const HopperEmblem: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="shrink-0"
  >
    <rect
      x="1.5"
      y="1.5"
      width="33"
      height="33"
      rx="8"
      fill="#0d1017"
      stroke="rgba(255,255,255,0.12)"
      strokeWidth="1.2"
    />
    <path
      d="M11 11H15.5V16H20.5V11H25V25H20.5V20H15.5V25H11V11Z"
      fill="url(#hop_matte_grad)"
    />
    <circle cx="27" cy="9" r="2.2" fill="#10B981" />
    <defs>
      <linearGradient id="hop_matte_grad" x1="11" y1="11" x2="25" y2="25" gradientUnits="userSpaceOnUse">
        <stop stopColor="#34D399" />
        <stop offset="0.5" stopColor="#06B6D4" />
        <stop offset="1" stopColor="#8B5CF6" />
      </linearGradient>
    </defs>
  </svg>
);

const ConfidenceRing: React.FC<{ value?: number; color?: string }> = ({
  value = 96,
  color = '#10B981',
}) => {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute font-mono-code text-[10px] font-bold text-white">{value}%</span>
    </div>
  );
};

// ============================================================================
// DATA: 4 REALISTIC ENGINEERING CI SCENARIOS
// ============================================================================
const STUDIO_SCENARIOS = [
  {
    id: 'playwright',
    tabTitle: 'Playwright Race Condition',
    shortTitle: 'Playwright Flake',
    badge: 'FLAKY • 68%',
    badgeStyle: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    ringColor: '#F59E0B',
    confidence: 97,
    repo: 'hopper-engine/web-app',
    workflow: 'e2e-checkout.yml • job #9142',
    prNumber: '#418',
    commitSha: 'a91f4c2',
    commitFile: 'tests/e2e/checkout.spec.ts:74',
    fingerprint: 'sha256:8a9f3c21e0d7b41a',
    cacheLatency: '180ms HNSW Cache Hit',
    provider: 'pgvector HNSW → Groq Llama-3.3',
    compressionBadge: '42,810 lines → 18 high-signal lines',
    noisePct: '98.4%',
    slackChannel: '#eng-frontend-ci',
    logs: [
      { line: 42792, text: '18:41:02Z [runner] Bootstrapping Playwright chromium-1148 (2 vCPU)' },
      {
        line: 42793,
        text: '18:41:02Z [env] STRIPE_TEST_KEY=',
        rawSecret: 'sk_test_51P9xK2L9a8M0nQ7vZ2eR',
        secretLabel: 'STRIPE_KEY',
      },
      {
        line: 42794,
        text: '18:41:03Z [env] GITHUB_TOKEN=',
        rawSecret: 'ghp_8K2mPq9vN4xL7rT1wZ6cB0',
        secretLabel: 'GITHUB_PAT',
      },
      { line: 42796, text: '18:41:04Z [test] checkout.spec.ts:74 › completes 3DS card payment' },
      {
        line: 42804,
        text: '18:41:34Z ERROR: Test timeout of 30000ms exceeded.',
        error: true,
      },
      {
        line: 42805,
        text: '  locator.click: Target page closed waiting for [data-testid="pay-submit"]',
        error: true,
      },
      {
        line: 42806,
        text: '  Call log: - element was visible, not enabled (hydration lock)',
        error: true,
      },
      {
        line: 42809,
        text: '18:41:34Z [auth] Authorization: Bearer ',
        rawSecret: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.hopper',
        secretLabel: 'JWT_TOKEN',
      },
      { line: 42810, text: '##[error]Process completed with exit code 1.', error: true },
    ],
    rootCause:
      'Stripe Elements iframe hydration races against the click assertion under GitHub runner CPU throttling. Hopper’s Flakiness Engine matched this exact SHA-256 signature in 11 of the last 16 runs on `main` (68% flake rate).',
    patchFile: 'tests/e2e/checkout.spec.ts',
    patch: `- await page.getByTestId('pay-submit').click();
+ const payBtn = page.getByTestId('pay-submit');
+ await expect(payBtn).toBeEnabled({ timeout: 15_000 });
+ await payBtn.click();`,
  },
  {
    id: 'oom',
    tabTitle: 'V8 Heap OOM Crash',
    shortTitle: 'V8 Heap OOM',
    badge: 'BUILD • 96%',
    badgeStyle: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    ringColor: '#F43F5E',
    confidence: 96,
    repo: 'acme/core-api',
    workflow: 'typecheck-monorepo.yml • job #6409',
    prNumber: '#914',
    commitSha: 'e21b08d',
    commitFile: '.github/workflows/typecheck-monorepo.yml:29',
    fingerprint: 'sha256:3d7c1b94a2f08e6c',
    cacheLatency: '1.4s • Groq Fast Path',
    provider: 'Groq Llama-3.3-70B (Circuit Closed)',
    compressionBadge: '61,420 lines → 22 high-signal lines',
    noisePct: '99.1%',
    slackChannel: '#eng-platform-builds',
    logs: [
      { line: 61398, text: '18:43:10Z [turbo] Running typecheck across 18 packages (concurrency=8)' },
      {
        line: 61399,
        text: '18:43:10Z [env] TURBO_TOKEN=',
        rawSecret: 'trb_live_98c1a7f3e2d904b12',
        secretLabel: 'TURBO_TOKEN',
      },
      { line: 61406, text: '18:43:48Z <--- Last few GCs --->' },
      { line: 61408, text: '18:43:49Z [2194:0x5a8c] Mark-Compact 4091.8 (4128.0) -> 4089.2 MB' },
      {
        line: 61412,
        text: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
        error: true,
      },
      {
        line: 61414,
        text: '  1: 0xb9c1f0 node::Abort() [/usr/local/bin/node]',
        error: true,
      },
      {
        line: 61415,
        text: '  2: 0xd6f342 v8::Utils::ReportOOMFailure(v8::internal::Isolate*, char const*)',
        error: true,
      },
      {
        line: 61418,
        text: '18:43:50Z [npm] NPM_AUTH_TOKEN=',
        rawSecret: 'npm_7qR9vT2mK4xW8pL1nZ5yC',
        secretLabel: 'NPM_TOKEN',
      },
      { line: 61420, text: '##[error]Command failed with exit code 134 (SIGABRT).', error: true },
    ],
    rootCause:
      'Commit `e21b08d` added deeply recursive Zod inference in `@acme/contracts`, pushing `tsc --noEmit` past V8’s 4096MB default heap ceiling when Turbo runs 8 workers concurrently.',
    patchFile: '.github/workflows/typecheck-monorepo.yml',
    patch: `  - name: Monorepo Typecheck
+   env:
+     NODE_OPTIONS: "--max-old-space-size=6144"
-   run: pnpm turbo run typecheck
+   run: pnpm turbo run typecheck --concurrency=3`,
  },
  {
    id: 'rls',
    tabTitle: 'Postgres RLS Migration Lock',
    shortTitle: 'Postgres RLS Lock',
    badge: 'DATABASE • 94%',
    badgeStyle: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    ringColor: '#8B5CF6',
    confidence: 94,
    repo: 'hopper-engine/backend',
    workflow: 'supabase-migrations.yml • job #2219',
    prNumber: '#307',
    commitSha: '9a0f63c',
    commitFile: 'supabase/migrations/0015_idx_failures.sql:4',
    fingerprint: 'sha256:9e4a7f12c8b31d55',
    cacheLatency: '1.2s • NVIDIA NIM Grounded',
    provider: 'NVIDIA NIM Nemotron-70B',
    compressionBadge: '19,340 lines → 14 high-signal lines',
    noisePct: '97.9%',
    slackChannel: '#eng-data-ops',
    logs: [
      { line: 19318, text: '18:45:01Z [supabase] Applying migration 0015_idx_failures.sql...' },
      {
        line: 19319,
        text: '18:45:01Z [db] DATABASE_URL=',
        rawSecret: 'postgres://hopper:Pr0dS3cr3t!@db.supabase.co:5432/postgres',
        secretLabel: 'POSTGRES_DSN',
      },
      {
        line: 19321,
        text: '18:45:01Z [vault] SUPABASE_SERVICE_ROLE=',
        rawSecret: 'sbp_4a9c2e8f1b7d3e6a9c0f2b',
        secretLabel: 'SUPABASE_KEY',
      },
      {
        line: 19328,
        text: '18:45:06Z ERROR: canceling statement due to lock timeout (SQLSTATE 55P03)',
        error: true,
      },
      {
        line: 19329,
        text: '  STATEMENT: CREATE INDEX idx_wf_workspace ON workflow_failures(workspace_id);',
        error: true,
      },
      {
        line: 19330,
        text: '  DETAIL: Process 8142 waits for ShareLock on relation "workflow_failures"',
        error: true,
      },
      { line: 19340, text: '##[error]Migration rolled back cleanly.', error: true },
    ],
    rootCause:
      'Standard `CREATE INDEX` acquires a blocking `ShareLock` on `workflow_failures`, colliding with concurrent RLS worker updates and breaching the 5s `lock_timeout`. Switching to `CONCURRENTLY` eliminates table write blocking.',
    patchFile: 'supabase/migrations/0015_idx_failures.sql',
    patch: `-- Run outside implicit transaction block
- CREATE INDEX idx_wf_workspace ON workflow_failures(workspace_id);
+ CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wf_workspace
+   ON workflow_failures (workspace_id, created_at DESC);`,
  },
  {
    id: 'docker',
    tabTitle: 'Docker BuildKit Secret Leak',
    shortTitle: 'Docker Secret Leak',
    badge: 'SECURITY • 99%',
    badgeStyle: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    ringColor: '#06B6D4',
    confidence: 99,
    repo: 'acme/infra-k8s',
    workflow: 'build-release-image.yml • job #1104',
    prNumber: '#88',
    commitSha: '4f8d21e',
    commitFile: 'backend/Dockerfile:18',
    fingerprint: 'sha256:c1b7e490fa228a0d',
    cacheLatency: '195ms HNSW Cache Hit',
    provider: 'pgvector HNSW → Groq Guard',
    compressionBadge: '28,905 lines → 16 high-signal lines',
    noisePct: '98.7%',
    slackChannel: '#sec-ci-alerts',
    logs: [
      { line: 28882, text: '18:48:11Z [buildx] #12 [builder 5/7] RUN npm ci --omit=dev' },
      {
        line: 28885,
        text: '18:48:12Z [buildx] ARG NPM_PRIVATE_KEY=',
        rawSecret: 'npm_live_9F3kLm8Pq2Vx7Rz1Wj',
        secretLabel: 'DOCKER_ARG_SECRET',
      },
      {
        line: 28890,
        text: '18:48:14Z ERROR: [policy/gitleaks] Secret baked into immutable Docker layer sha256:9f2a',
        error: true,
      },
      {
        line: 28891,
        text: '  Rule: SecretsUsedInArgOrEnv detected at backend/Dockerfile:18',
        error: true,
      },
      {
        line: 28895,
        text: '18:48:14Z [registry] AWS_SECRET_ACCESS_KEY=',
        rawSecret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        secretLabel: 'AWS_SECRET_KEY',
      },
      { line: 28905, text: '##[error]BuildKit security policy blocked image push (exit 2).', error: true },
    ],
    rootCause:
      'Passing `NPM_PRIVATE_KEY` via Dockerfile `ARG` persists the token in image history metadata, triggering the BuildKit + Gitleaks security gate. Use BuildKit ephemeral `--mount=type=secret` instead.',
    patchFile: 'backend/Dockerfile',
    patch: `- ARG NPM_PRIVATE_KEY
- RUN echo "//registry.npmjs.org/:_authToken=$NPM_PRIVATE_KEY" > .npmrc && npm ci
+ RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \\
+     npm ci --omit=dev`,
  },
];

const PIPELINE_STEPS_TICKER = [
  { id: 1, label: 'Webhook Ingest', detail: 'HMAC verified' },
  { id: 2, label: 'ANSI & Secret Scrub', detail: 'Zero-leak redaction' },
  { id: 3, label: 'Log Slicer (-98%)', detail: '320KB ring buffer' },
  { id: 4, label: 'SHA + pgvector', detail: 'HNSW similarity' },
  { id: 5, label: 'AI Gateway', detail: 'Groq / NIM routed' },
];

const ECOSYSTEM_LOGOS = [
  { name: 'GitHub Actions', category: 'CI/CD', dotColor: '#10B981' },
  { name: 'Playwright', category: 'E2E', dotColor: '#06B6D4' },
  { name: 'Vitest', category: 'Unit', dotColor: '#8B5CF6' },
  { name: 'Docker', category: 'Containers', dotColor: '#06B6D4' },
  { name: 'Postgres', category: 'pgvector + RLS', dotColor: '#10B981' },
  { name: 'Node.js', category: 'Runtime', dotColor: '#10B981' },
  { name: 'Rust', category: 'Cargo', dotColor: '#F59E0B' },
  { name: 'Go', category: 'Testing', dotColor: '#06B6D4' },
  { name: 'Pytest', category: 'Python', dotColor: '#8B5CF6' },
  { name: 'Slack', category: 'Alerts', dotColor: '#10B981' },
  { name: 'Discord', category: 'Webhooks', dotColor: '#8B5CF6' },
  { name: 'Stripe', category: 'Billing', dotColor: '#06B6D4' },
];

// ============================================================================
// ENHANCED GRAPH 1: BAYESIAN FLAKINESS PROBABILITY & STABILITY MATRIX
// ============================================================================
interface FlakinessRun {
  run: number;
  sha: string;
  branch: string;
  test: string;
  status: 'passed' | 'flaky' | 'failed';
  score: number; // 0 to 100 flakiness probability
  duration: string;
}

const FLAKINESS_RUNS: FlakinessRun[] = [
  { run: 9126, sha: 'c4e9102', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 12, duration: '2m 14s' },
  { run: 9127, sha: 'f1a890b', branch: 'feat/cart-sync', test: 'checkout.spec.ts', status: 'flaky', score: 58, duration: '4m 02s' },
  { run: 9128, sha: 'd9021e4', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 24, duration: '2m 19s' },
  { run: 9129, sha: 'e210a44', branch: 'main', test: 'checkout.spec.ts', status: 'flaky', score: 62, duration: '3m 55s' },
  { run: 9130, sha: 'a718c99', branch: 'refactor/stripe', test: 'checkout.spec.ts', status: 'flaky', score: 71, duration: '4m 12s' },
  { run: 9131, sha: 'b3910ff', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 32, duration: '2m 21s' },
  { run: 9132, sha: '99a41c2', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 28, duration: '2m 10s' },
  { run: 9133, sha: '8c21a4e', branch: 'feat/checkout-3ds', test: 'checkout.spec.ts', status: 'flaky', score: 74, duration: '4m 20s' },
  { run: 9134, sha: '7e10b91', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 29, duration: '2m 15s' },
  { run: 9135, sha: '6f01c82', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 25, duration: '2m 08s' },
  { run: 9136, sha: '5b991d3', branch: 'fix/auth-cookie', test: 'auth.spec.ts', status: 'failed', score: 8, duration: '1m 45s' },
  { run: 9137, sha: '4a882e4', branch: 'main', test: 'checkout.spec.ts', status: 'flaky', score: 66, duration: '3m 48s' },
  { run: 9138, sha: '3c771f5', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 31, duration: '2m 12s' },
  { run: 9139, sha: '2d660a6', branch: 'feat/tax-calc', test: 'checkout.spec.ts', status: 'flaky', score: 69, duration: '4m 05s' },
  { run: 9140, sha: '1e559b7', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 28, duration: '2m 16s' },
  { run: 9141, sha: '0f448c8', branch: 'main', test: 'checkout.spec.ts', status: 'passed', score: 22, duration: '2m 11s' },
  { run: 9142, sha: 'a91f4c2', branch: 'feat/checkout-3ds', test: 'checkout.spec.ts', status: 'flaky', score: 68, duration: '4m 15s' },
];

const EnhancedFlakinessGraph: React.FC = () => {
  const [selectedRun, setSelectedRun] = useState<FlakinessRun>(FLAKINESS_RUNS[FLAKINESS_RUNS.length - 1]);
  const [filterMode, setFilterMode] = useState<'all' | 'flaky' | 'failed'>('all');

  // Generate SVG path for the Bayesian flakiness probability line
  const svgWidth = 640;
  const svgHeight = 200;
  const paddingX = 35;
  const paddingY = 25;

  const points = useMemo(() => {
    return FLAKINESS_RUNS.map((r, i) => {
      const x = paddingX + (i / (FLAKINESS_RUNS.length - 1)) * (svgWidth - paddingX * 2);
      const y = svgHeight - paddingY - (r.score / 100) * (svgHeight - paddingY * 2);
      return { x, y, run: r };
    });
  }, []);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
    }
    return d;
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const last = points[points.length - 1];
    const first = points[0];
    return `${pathD} L ${last.x} ${svgHeight - paddingY} L ${first.x} ${svgHeight - paddingY} Z`;
  }, [pathD, points]);

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d1017] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Bayesian Flakiness Probability & Stability Matrix</h3>
            <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 font-mono-code text-[10px] text-amber-300">
              P(Flake|Fail) = 68.4%
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Cross-commit telemetry isolating non-deterministic timing spikes from real regressions.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#08090d] p-1 font-mono-code text-[11px]">
          {(['all', 'flaky', 'failed'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                filterMode === mode
                  ? 'bg-zinc-800 text-white font-semibold shadow'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {mode === 'all' ? 'All (17)' : mode === 'flaky' ? 'Flaky (7)' : 'Failures (1)'}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Curve Canvas */}
      <div className="relative mt-4 w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#07080e] p-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-44 w-full overflow-visible sm:h-52"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="flakinessMatteGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.22" />
              <stop offset="70%" stopColor="#F59E0B" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="flakinessStrokeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>

          {/* Dotted horizontal threshold lines */}
          <line
            x1={paddingX}
            y1={svgHeight - paddingY - (50 / 100) * (svgHeight - paddingY * 2)}
            x2={svgWidth - paddingX}
            y2={svgHeight - paddingY - (50 / 100) * (svgHeight - paddingY * 2)}
            stroke="rgba(245, 158, 11, 0.25)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={svgWidth - paddingX + 5}
            y={svgHeight - paddingY - (50 / 100) * (svgHeight - paddingY * 2) + 3}
            fill="#F59E0B"
            fontSize="9"
            fontFamily="monospace"
          >
            50% Flake Threshold
          </text>

          {/* Gradient area under curve */}
          <path d={areaD} fill="url(#flakinessMatteGrad)" />

          {/* Crisp curve line */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#flakinessStrokeGrad)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Interactive Run Nodes */}
          {points.map((pt) => {
            const isSelected = selectedRun.run === pt.run.run;
            const isMatch = filterMode === 'all' || pt.run.status === filterMode;
            const nodeColor =
              pt.run.status === 'passed'
                ? '#10B981'
                : pt.run.status === 'flaky'
                ? '#F59E0B'
                : '#F43F5E';

            return (
              <g
                key={pt.run.run}
                onClick={() => setSelectedRun(pt.run)}
                className="cursor-pointer"
                opacity={isMatch ? 1 : 0.2}
              >
                {isSelected && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="8"
                    fill="none"
                    stroke={nodeColor}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? '5' : '3.5'}
                  fill={nodeColor}
                  className="transition-all hover:scale-125"
                />
              </g>
            );
          })}
        </svg>

        {/* Selected Run Inspection Card */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#090b12] p-3 font-mono-code text-xs">
          <div className="flex items-center gap-3">
            <span
              className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                selectedRun.status === 'passed'
                  ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : selectedRun.status === 'flaky'
                  ? 'border border-amber-500/30 bg-amber-500/15 text-amber-300'
                  : 'border border-rose-500/30 bg-rose-500/15 text-rose-300'
              }`}
            >
              RUN #{selectedRun.run} • {selectedRun.status.toUpperCase()}
            </span>
            <span className="text-zinc-400">
              commit <span className="text-zinc-200">{selectedRun.sha}</span> ({selectedRun.branch})
            </span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400 text-[11px]">
            <span>
              Target: <span className="text-zinc-200">{selectedRun.test}</span>
            </span>
            <span>
              Flake Score: <span className="font-bold text-amber-300">{selectedRun.score}%</span>
            </span>
            <span>
              Duration: <span className="text-zinc-200">{selectedRun.duration}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ENHANCED GRAPH 2: PGVECTOR HNSW 1536-D SEMANTIC CLUSTERING MAP
// ============================================================================
interface VectorClusterPoint {
  id: string;
  x: number; // 0 to 100
  y: number; // 0 to 100
  cluster: 'playwright' | 'oom' | 'rls' | 'docker';
  label: string;
  fingerprint: string;
  similarity: number; // e.g. 0.97
  latency: string;
}

const VECTOR_POINTS: VectorClusterPoint[] = [
  // Playwright Cluster (Amber/Emerald)
  { id: 'pw-1', x: 28, y: 32, cluster: 'playwright', label: 'locator.click hydration timeout', fingerprint: 'sha256:8a9f3c21', similarity: 0.984, latency: '14.2ms' },
  { id: 'pw-2', x: 32, y: 26, cluster: 'playwright', label: '30000ms test timeout exceeded', fingerprint: 'sha256:8a9f3c22', similarity: 0.972, latency: '14.5ms' },
  { id: 'pw-3', x: 24, y: 38, cluster: 'playwright', label: 'page.waitForSelector detached', fingerprint: 'sha256:8a9f3c23', similarity: 0.951, latency: '15.1ms' },
  { id: 'pw-4', x: 36, y: 34, cluster: 'playwright', label: 'element not visible under throttle', fingerprint: 'sha256:8a9f3c24', similarity: 0.963, latency: '14.8ms' },

  // V8 Heap Limit Cluster (Rose)
  { id: 'oom-1', x: 72, y: 28, cluster: 'oom', label: 'JavaScript heap out of memory', fingerprint: 'sha256:3d7c1b94', similarity: 0.991, latency: '13.9ms' },
  { id: 'oom-2', x: 76, y: 22, cluster: 'oom', label: 'Mark-Compact allocation failure', fingerprint: 'sha256:3d7c1b95', similarity: 0.978, latency: '14.1ms' },
  { id: 'oom-3', x: 80, y: 35, cluster: 'oom', label: 'tsc recursion heap ceiling breached', fingerprint: 'sha256:3d7c1b96', similarity: 0.965, latency: '14.6ms' },

  // Postgres RLS Lock Cluster (Violet)
  { id: 'rls-1', x: 68, y: 74, cluster: 'rls', label: 'ShareLock timeout on workflow_failures', fingerprint: 'sha256:9e4a7f12', similarity: 0.982, latency: '14.0ms' },
  { id: 'rls-2', x: 74, y: 68, cluster: 'rls', label: 'lock_timeout SQLSTATE 55P03', fingerprint: 'sha256:9e4a7f13', similarity: 0.975, latency: '14.3ms' },
  { id: 'rls-3', x: 62, y: 80, cluster: 'rls', label: 'concurrent CREATE INDEX contention', fingerprint: 'sha256:9e4a7f14', similarity: 0.948, latency: '15.2ms' },

  // Docker BuildKit Secret Leak Cluster (Cyan)
  { id: 'doc-1', x: 30, y: 72, cluster: 'docker', label: 'SecretsUsedInArgOrEnv policy failure', fingerprint: 'sha256:c1b7e490', similarity: 0.994, latency: '13.8ms' },
  { id: 'doc-2', x: 25, y: 78, cluster: 'docker', label: 'NPM_PRIVATE_KEY in layer metadata', fingerprint: 'sha256:c1b7e491', similarity: 0.981, latency: '14.1ms' },
  { id: 'doc-3', x: 35, y: 65, cluster: 'docker', label: 'BuildKit gitleaks push gate exit 2', fingerprint: 'sha256:c1b7e492', similarity: 0.967, latency: '14.7ms' },
];

const EnhancedVectorClusterGraph: React.FC = () => {
  const [activeCluster, setActiveCluster] = useState<string>('all');
  const [hoveredPoint, setHoveredPoint] = useState<VectorClusterPoint | null>(VECTOR_POINTS[0]);

  const clusterMeta: Record<string, { label: string; color: string; count: number }> = {
    playwright: { label: 'Playwright Flakes', color: '#10B981', count: 4 },
    oom: { label: 'V8 OOM Crashes', color: '#F43F5E', count: 3 },
    rls: { label: 'Postgres DB Locks', color: '#8B5CF6', count: 3 },
    docker: { label: 'Secret Leaks', color: '#06B6D4', count: 3 },
  };

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d1017] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">pgvector HNSW 1536-D Semantic Embedding Scatterplot</h3>
            <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 font-mono-code text-[10px] text-violet-300">
              Cosine Similarity ≥ 0.94
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Real-time projection of failure embeddings into high-dimensional similarity clusters for instant cache resolution.
          </p>
        </div>

        {/* Cluster buttons */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#08090d] p-1 font-mono-code text-[11px]">
          <button
            type="button"
            onClick={() => setActiveCluster('all')}
            className={`rounded-lg px-2.5 py-1 transition-all ${
              activeCluster === 'all'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            All Clusters
          </button>
          {Object.entries(clusterMeta).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveCluster(key)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all ${
                activeCluster === key
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
              <span>{meta.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scatterplot Canvas */}
      <div className="relative mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="relative h-64 overflow-hidden rounded-xl border border-white/[0.06] bg-[#07080e] p-4 lg:col-span-8 sm:h-72">
          {/* Subtle grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />

          {/* Cosine similarity threshold circles */}
          <div
            className="pointer-events-none absolute left-[28%] top-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.04]"
            style={{ width: '130px', height: '130px' }}
          />
          <div
            className="pointer-events-none absolute left-[75%] top-[27%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-500/20 bg-rose-500/[0.04]"
            style={{ width: '110px', height: '110px' }}
          />
          <div
            className="pointer-events-none absolute left-[68%] top-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-500/20 bg-violet-500/[0.04]"
            style={{ width: '120px', height: '120px' }}
          />
          <div
            className="pointer-events-none absolute left-[28%] top-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-500/20 bg-cyan-500/[0.04]"
            style={{ width: '120px', height: '120px' }}
          />

          {/* Cluster Points */}
          {VECTOR_POINTS.map((pt) => {
            const isMatch = activeCluster === 'all' || activeCluster === pt.cluster;
            const isHovered = hoveredPoint?.id === pt.id;
            const color = clusterMeta[pt.cluster].color;

            return (
              <div
                key={pt.id}
                onMouseEnter={() => setHoveredPoint(pt)}
                onClick={() => setHoveredPoint(pt)}
                style={{
                  left: `${pt.x}%`,
                  top: `${pt.y}%`,
                  opacity: isMatch ? 1 : 0.15,
                  transform: 'translate(-50%, -50%)',
                }}
                className="absolute cursor-pointer transition-all duration-200"
              >
                <div className="relative flex items-center justify-center">
                  {isHovered && (
                    <span
                      className="absolute h-7 w-7 rounded-full border animate-ping"
                      style={{ borderColor: color, opacity: 0.6 }}
                    />
                  )}
                  <span
                    className={`rounded-full transition-all ${
                      isHovered ? 'h-3.5 w-3.5 shadow-lg' : 'h-2.5 w-2.5'
                    }`}
                    style={{
                      backgroundColor: color,
                      boxShadow: isHovered ? `0 0 12px ${color}` : 'none',
                    }}
                  />
                </div>
              </div>
            );
          })}

          <div className="pointer-events-none absolute bottom-2 left-3 font-mono-code text-[10px] text-zinc-500">
            HNSW Index (M=16, ef_construction=64) • pgvector v0.8.0
          </div>
        </div>

        {/* Selected Cluster Point Detail Card */}
        <div className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#090b12] p-4 lg:col-span-4">
          {hoveredPoint ? (
            <div className="space-y-3 font-mono-code text-xs">
              <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
                <span
                  className="rounded px-2 py-0.5 text-[10.5px] font-bold"
                  style={{
                    backgroundColor: `${clusterMeta[hoveredPoint.cluster].color}20`,
                    color: clusterMeta[hoveredPoint.cluster].color,
                    border: `1px solid ${clusterMeta[hoveredPoint.cluster].color}40`,
                  }}
                >
                  {clusterMeta[hoveredPoint.cluster].label.toUpperCase()}
                </span>
                <span className="text-zinc-500">CACHE HIT</span>
              </div>

              <div>
                <span className="text-[10px] uppercase text-zinc-500">Normalized Fingerprint</span>
                <div className="text-emerald-300 text-xs font-semibold">{hoveredPoint.fingerprint}</div>
              </div>

              <div>
                <span className="text-[10px] uppercase text-zinc-500">Error Pattern</span>
                <div className="text-zinc-200 text-[11.5px] leading-relaxed">{hoveredPoint.label}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-2">
                <div>
                  <span className="text-[10px] uppercase text-zinc-500">Similarity</span>
                  <div className="font-bold text-white">{(hoveredPoint.similarity * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-zinc-500">HNSW Latency</span>
                  <div className="font-bold text-cyan-300">{hoveredPoint.latency}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-xs text-zinc-500">
              Hover over any point in the embedding space to inspect.
            </div>
          )}

          <div className="mt-3 rounded-lg border border-white/[0.06] bg-[#06070b] p-2.5 text-[10.5px] text-zinc-400 font-mono-code">
            Similarity &gt;= 0.94 bypasses AI reasoning pass completely, serving instant pre-computed diff patch.
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ENHANCED GRAPH 3: 52MB TO 18-LINE LOG SLICING & COMPRESSION WATERFALL
// ============================================================================
const EnhancedLogWaterfallGraph: React.FC = () => {
  const [metricUnit, setMetricUnit] = useState<'bytes' | 'tokens'>('bytes');

  const stages = [
    {
      name: 'Raw GitHub Actions Runner Stream',
      bytes: '52,400 KB',
      tokens: '13,100,000 tokens',
      pct: '100%',
      type: 'base',
      color: '#64748B',
      desc: 'Raw terminal output with runner container bootstrap, apt downloads, npm verbose logs',
    },
    {
      name: 'Runner Bootstrapping & Download Noise',
      bytes: '-39,920 KB',
      tokens: '-9,980,000 tokens',
      pct: '-76.2%',
      type: 'strip',
      color: '#F43F5E',
      desc: 'Cloning steps, docker pull output, caching artifacts, and setup hooks stripped',
    },
    {
      name: 'Passing Test Stdout & Verbose Steps',
      bytes: '-9,740 KB',
      tokens: '-2,435,000 tokens',
      pct: '-18.6%',
      type: 'strip',
      color: '#F43F5E',
      desc: 'Green passing test assertion output and redundant console.log statements pruned',
    },
    {
      name: 'ANSI Terminal Escape Sequences',
      bytes: '-1,890 KB',
      tokens: '-472,500 tokens',
      pct: '-3.6%',
      type: 'strip',
      color: '#F59E0B',
      desc: 'Terminal color codes, cursor repositioning sequences, and carriage returns scrubbed',
    },
    {
      name: 'Secret Scrubber Redaction Pass',
      bytes: '42 rules applied',
      tokens: '0 leaked tokens',
      pct: '100% safe',
      type: 'secure',
      color: '#06B6D4',
      desc: 'AWS credentials, Stripe test keys, GitHub PATs, and PostgreSQL URIs securely masked',
    },
    {
      name: 'High-Signal Failure Ring Buffer',
      bytes: '14.2 KB (18 lines)',
      tokens: '3,550 tokens',
      pct: '0.02% of raw',
      type: 'final',
      color: '#10B981',
      desc: 'Exact failure line, preceding context, stack trace, and fatal exception signature preserved',
    },
  ];

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d1017] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">52MB to 18-Line Log Slicing & Noise Compression Waterfall</h3>
            <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono-code text-[10px] text-emerald-300">
              99.97% Volume Reduction
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            How Hopper extracts actionable diagnostic signal without blowing up LLM context limits.
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#08090d] p-1 font-mono-code text-[11px]">
          <button
            type="button"
            onClick={() => setMetricUnit('bytes')}
            className={`rounded-lg px-2.5 py-1 transition-all ${
              metricUnit === 'bytes'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Data Volume (KB)
          </button>
          <button
            type="button"
            onClick={() => setMetricUnit('tokens')}
            className={`rounded-lg px-2.5 py-1 transition-all ${
              metricUnit === 'tokens'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            LLM Tokens
          </button>
        </div>
      </div>

      {/* Waterfall Stages */}
      <div className="mt-5 space-y-3">
        {stages.map((st, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-[#07080e] p-3 transition-colors hover:border-white/15 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono-code text-[11px] font-bold"
                style={{ backgroundColor: `${st.color}20`, color: st.color }}
              >
                0{i + 1}
              </span>
              <div>
                <div className="text-xs font-semibold text-zinc-200">{st.name}</div>
                <div className="text-[11px] text-zinc-500">{st.desc}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:justify-end font-mono-code text-xs">
              <span className="text-zinc-300 font-semibold">
                {metricUnit === 'bytes' ? st.bytes : st.tokens}
              </span>
              <span
                className="rounded px-2 py-0.5 text-[10px] font-bold"
                style={{ backgroundColor: `${st.color}15`, color: st.color }}
              >
                {st.pct}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// ENHANCED GRAPH 4: MTTR REDUCTION BENCHMARK & ROI CALCULATOR
// ============================================================================
const EnhancedMttrRoiCalculator: React.FC = () => {
  const [teamSize, setTeamSize] = useState<number>(25);
  const [failedBuildsPerWeek, setFailedBuildsPerWeek] = useState<number>(40);

  // Calculations:
  // Manual triage: ~42.5 minutes per failure
  // Hopper triage: ~1.4s (instant)
  // Time saved per failure = ~40 mins = 0.67 hrs
  const hoursSavedPerMonth = useMemo(() => {
    return Math.round(failedBuildsPerWeek * 4 * 0.67);
  }, [failedBuildsPerWeek]);

  // Average eng salary $75/hour
  const dollarsSavedPerMonth = useMemo(() => {
    return Math.round(hoursSavedPerMonth * 75);
  }, [hoursSavedPerMonth]);

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d1017] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">MTTR Resolution Benchmark & Engineering ROI Calculator</h3>
            <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 font-mono-code text-[10px] text-cyan-300">
              1,416x Faster Resolution
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Compare traditional developer log archeology against automated line-grounded CI diagnosis.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Benchmark Bars */}
        <div className="space-y-4 lg:col-span-7">
          <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wider font-mono-code">
            Time to Diagnose & Locate Offending Line
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs font-mono-code">
                <span className="text-zinc-400">Manual Log Archeology (Terminal Scrolling)</span>
                <span className="text-rose-400 font-bold">42.5 min</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full w-[100%] rounded-full bg-rose-500/80" />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs font-mono-code">
                <span className="text-zinc-400">Blind Full CI Re-run (Waiting in Queue)</span>
                <span className="text-amber-400 font-bold">18.2 min</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full w-[43%] rounded-full bg-amber-500/80" />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs font-mono-code">
                <span className="text-zinc-400">Hopper AI Gateway Pass (Groq / NIM)</span>
                <span className="text-cyan-400 font-bold">1.4 sec</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full w-[4%] rounded-full bg-cyan-400" />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs font-mono-code">
                <span className="text-emerald-400 font-semibold">Hopper pgvector HNSW Cache Hit</span>
                <span className="text-emerald-400 font-bold">180 ms</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full w-[1.5%] rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Interactive ROI Sliders & Live Results */}
        <div className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#090b12] p-4 lg:col-span-5">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between font-mono-code text-xs text-zinc-300">
                <span>Team Size</span>
                <span className="text-emerald-400 font-bold">{teamSize} developers</span>
              </div>
              <input
                type="range"
                min="5"
                max="150"
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="mt-2 w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between font-mono-code text-xs text-zinc-300">
                <span>Failing CI Jobs / Week</span>
                <span className="text-cyan-400 font-bold">{failedBuildsPerWeek} failed runs</span>
              </div>
              <input
                type="range"
                min="10"
                max="250"
                value={failedBuildsPerWeek}
                onChange={(e) => setFailedBuildsPerWeek(Number(e.target.value))}
                className="mt-2 w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-4 font-mono-code text-center">
            <div className="rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20 p-2.5">
              <div className="text-lg font-bold text-emerald-400">{hoursSavedPerMonth} hrs</div>
              <div className="text-[10px] text-zinc-400">Reclaimed / Month</div>
            </div>
            <div className="rounded-lg bg-cyan-500/[0.08] border border-cyan-500/20 p-2.5">
              <div className="text-lg font-bold text-cyan-300">${dollarsSavedPerMonth.toLocaleString()}</div>
              <div className="text-[10px] text-zinc-400">Engineering Cost Saved</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4-STAGE INTERACTIVE PIPELINE EXPLORER DATA
// ============================================================================
const PIPELINE_EXPLORER_STAGES = [
  {
    num: '01',
    shortTitle: 'Ingest',
    title: '01. Webhook Ingest & Durable Queue',
    latency: '28ms p50',
    accent: '#10B981',
    icon: Github,
    description:
      'Receives GitHub `workflow_job` webhooks, verifies HMAC-SHA256 signatures with timing-safe comparison, deduplicates delivery IDs, and enqueues work into a Postgres `SKIP LOCKED` durable job store.',
    metrics: [
      { label: 'Auth', value: 'HMAC-SHA256 + GitHub App JWT' },
      { label: 'Queue', value: 'Durable Postgres SKIP LOCKED' },
      { label: 'Rate Limiter', value: 'Adaptive ETag + Retry-After' },
      { label: 'Throughput', value: '2,400 webhooks / min' },
    ],
    codeLang: 'pipeline/ingest.ts',
    code: `// backend/src/server/routes/webhooks.ts
const verified = verifySignature(req.rawBody, req.headers['x-hub-signature-256']);
if (!verified) throw new UnauthorizedError('Invalid GitHub HMAC');

await ciQueue.enqueue({
  deliveryId: req.headers['x-github-delivery'],
  workspaceId: repo.workspace_id,
  jobId: payload.workflow_job.id,
  priority: payload.workflow_job.conclusion === 'failure' ? 'high' : 'low',
}); // -> committed in 28ms`,
  },
  {
    num: '02',
    shortTitle: 'Normalize & Scrub',
    title: '02. ANSI Strip, Secret Scrub & Log Slicer',
    latency: '54ms p50',
    accent: '#06B6D4',
    icon: ShieldCheck,
    description:
      'Streams raw job logs through a 320KB ring buffer without blowing up worker memory. Strips ANSI escape sequences, redacts 42+ secret patterns, and slices out 98.4% of passing noise.',
    metrics: [
      { label: 'Noise Removed', value: '98.4% average reduction' },
      { label: 'Secret Patterns', value: 'AWS, Stripe, GitHub, JWT, DSN' },
      { label: 'Memory Cap', value: '320KB streaming ring buffer' },
      { label: 'Fingerprinting', value: 'Normalized SHA-256 hash' },
    ],
    codeLang: 'parser/secret-scrubber.ts',
    code: `// backend/src/lib/parser/secret-scrubber.ts
const clean = stripAnsi(sliceRingBuffer(rawStream, { maxBytes: 327_680 }));
const { scrubbed, redactedCount } = scrubSecrets(clean);
const signature = fingerprintFailure(scrubbed);

// Output:
// redactedCount: 3 (STRIPE_KEY, GITHUB_PAT, JWT_TOKEN)
// tokens: 42,810 lines -> 18 lines (-98.4% prompt cost)
// fingerprint: "sha256:8a9f3c21e0d7b41a"`,
  },
  {
    num: '03',
    shortTitle: 'Hybrid Vector + AI',
    title: '03. pgvector HNSW Cache & Resilient AI Gateway',
    latency: '180ms hit / 1.4s miss',
    accent: '#8B5CF6',
    icon: Cpu,
    description:
      'Looks up the normalized fingerprint and semantic embedding in Supabase pgvector HNSW first. On cache miss, routes across Groq and NVIDIA NIM with circuit breakers, bulkheads, and atomic org budget ledgers.',
    metrics: [
      { label: 'Semantic Cache', value: 'pgvector HNSW (cosine >= 0.94)' },
      { label: 'Primary / Fallback', value: 'Groq Llama-3.3 → NVIDIA NIM' },
      { label: 'Resilience', value: 'Circuit Breaker + Bulkhead' },
      { label: 'Budget Control', value: 'Atomic Postgres Token Ledger' },
    ],
    codeLang: 'supabase/hnsw_lookup.sql',
    code: `-- Semantic cache lookup with tenant RLS isolation
SELECT id, root_cause, suggested_patch,
       1 - (embedding <=> $1::vector) AS similarity
FROM failure_signatures
WHERE workspace_id = auth.workspace_id()
  AND 1 - (embedding <=> $1::vector) >= 0.94
ORDER BY embedding <=> $1::vector
LIMIT 1; -- HNSW index scan: 14.2ms`,
  },
  {
    num: '04',
    shortTitle: 'Action & Notify',
    title: '04. PR Comment, Auto-Rerun & Chat Alerts',
    latency: '145ms p50',
    accent: '#10B981',
    icon: GitPullRequest,
    description:
      'Upserts a single zero-noise Pull Request comment with diff-grounded patches, writes GitHub Check Run annotations, auto-reruns confirmed flaky jobs, and sends rich embeds to Slack or Discord.',
    metrics: [
      { label: 'PR Delivery', value: 'Single Upserted Diff Comment' },
      { label: 'Flake Recovery', value: 'Safe Auto-Rerun (max 2 retries)' },
      { label: 'Notifications', value: 'Slack Block Kit + Discord' },
      { label: 'Audit Trail', value: '90-Day Signature Analytics' },
    ],
    codeLang: 'github/pr-reporter.ts',
    code: `// backend/src/lib/github/pr-reporter.ts
await github.upsertPRComment(repo, prNumber, renderDiagnosisMarkdown(report));

if (flakiness.score >= 0.45 && job.attempt < 2) {
  await github.rerunFailedJobs(repo, runId);
}
await slackProcessor.dispatch(workspace.slackChannel, report);
// -> PR updated & #eng-frontend-ci alerted in 145ms`,
  },
];

// ============================================================================
// MAIN LANDING PAGE COMPONENT
// ============================================================================
export const LandingPage: React.FC = () => {
  // Studio State
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [activeTickerStep, setActiveTickerStep] = useState(5);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [scrubberEnabled, setScrubberEnabled] = useState(true);
  const [decryptTrigger, setDecryptTrigger] = useState(0);
  const [copiedPatch, setCopiedPatch] = useState(false);
  const [rerunStatus, setRerunStatus] = useState<'idle' | 'running' | 'passed'>('idle');

  // Hero CLI Copy State
  const [copiedCli, setCopiedCli] = useState(false);

  // Floating Slack Alert Toast State
  const [slackToast, setSlackToast] = useState<{
    id: number;
    channel: string;
    repo: string;
    pr: string;
    title: string;
    badge: string;
    latency: string;
  } | null>(null);

  // Telemetry Lab active tab
  const [activeTelemetryTab, setActiveTelemetryTab] = useState<'flakiness' | 'vector' | 'waterfall' | 'roi'>('flakiness');

  // Bento Card 1 Interactive Scrubber Toggle
  const [bentoScrubbed, setBentoScrubbed] = useState(true);

  // Pipeline Explorer State
  const [explorerIdx, setExplorerIdx] = useState(0);

  // Pricing State
  const [annualBilling, setAnnualBilling] = useState(true);

  // Navigation & Install Modal State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('Pro');
  const [installPhase, setInstallPhase] = useState<'configure' | 'installing' | 'done'>('configure');
  const [modalRepos, setModalRepos] = useState<Record<string, boolean>>({
    'hopper-engine/web-app': true,
    'acme/core-api': true,
    'acme/web-dashboard': true,
    'acme/infra-k8s': false,
  });
  const [modalOptions, setModalOptions] = useState({
    slackAlerts: true,
    autoRerunFlaky: true,
  });

  const scenario = STUDIO_SCENARIOS[scenarioIdx];
  const activeExplorer = PIPELINE_EXPLORER_STAGES[explorerIdx];

  // Replay 5-stage animated diagnosis ticker
  const triggerDiagnosisReplay = useCallback(() => {
    setIsDiagnosing(true);
    setActiveTickerStep(1);
    setCopiedPatch(false);
    setRerunStatus('idle');
    setDecryptTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      triggerDiagnosisReplay();
    }, 350);
    return () => clearTimeout(startTimer);
  }, [triggerDiagnosisReplay]);

  useEffect(() => {
    if (!isDiagnosing) return;
    if (activeTickerStep >= 5) {
      const doneTimer = setTimeout(() => setIsDiagnosing(false), 240);
      return () => clearTimeout(doneTimer);
    }
    const nextTimer = setTimeout(() => {
      setActiveTickerStep((s) => s + 1);
    }, 220);
    return () => clearTimeout(nextTimer);
  }, [isDiagnosing, activeTickerStep]);

  const handleSelectScenario = (idx: number) => {
    setScenarioIdx(idx);
    triggerDiagnosisReplay();
  };

  const safeCopy = (text: string, setter: (val: boolean) => void) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    } catch {
      // Fallback
    }
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleAutoRerun = () => {
    if (rerunStatus === 'running') return;
    setRerunStatus('running');
    setTimeout(() => {
      setRerunStatus('passed');
    }, 1500);
  };

  const handleTestSlackAlert = () => {
    setSlackToast({
      id: Date.now(),
      channel: scenario.slackChannel,
      repo: scenario.repo,
      pr: scenario.prNumber,
      title: scenario.tabTitle,
      badge: scenario.badge,
      latency: scenario.cacheLatency,
    });
  };

  useEffect(() => {
    if (!slackToast) return;
    const t = setTimeout(() => setSlackToast(null), 5000);
    return () => clearTimeout(t);
  }, [slackToast]);

  const openInstallModal = (tierName = 'Pro') => {
    setSelectedPlan(tierName);
    setInstallPhase('configure');
    setInstallModalOpen(true);
    setMobileMenuOpen(false);
  };

  const handleAuthorizeInstall = () => {
    setInstallPhase('installing');
    setTimeout(() => {
      setInstallPhase('done');
    }, 1250);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const dockItems = useMemo(
    () => [
      { label: 'Hero', icon: Home, onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
      { label: 'Live Studio', icon: Terminal, onClick: () => scrollToSection('studio') },
      { label: 'Telemetry Lab', icon: Activity, onClick: () => scrollToSection('telemetry-lab') },
      { label: 'Capabilities', icon: Layers, onClick: () => scrollToSection('capabilities') },
      { label: 'Pipeline', icon: Workflow, onClick: () => scrollToSection('pipeline') },
      { label: 'Pricing', icon: CreditCard, onClick: () => scrollToSection('pricing') },
      {
        label: 'Install App',
        icon: Download,
        accent: true,
        onClick: () => openInstallModal('Pro'),
      },
    ],
    []
  );

  const pricingTiers = useMemo(
    () => [
      {
        name: 'Hobby',
        desc: 'For indie developers & open-source repos shipping fast with GitHub Actions.',
        monthly: 0,
        annual: 0,
        featured: false,
        cta: 'Start Free with GitHub',
        features: [
          '100 CI failure diagnoses / month',
          'Up to 3 GitHub repositories',
          'Secret Scrubber & 320KB Log Slicer',
          'Diff-grounded PR fix comments',
          '7-day failure signature history',
        ],
      },
      {
        name: 'Pro',
        desc: 'For engineering teams crushing flaky tests and multi-minute log archaeology.',
        monthly: 19,
        annual: 15,
        featured: true,
        badge: 'Most Popular',
        cta: 'Install Pro — 14-Day Trial',
        features: [
          '2,500 CI failure diagnoses / month',
          'Unlimited GitHub repositories',
          'Cross-Run Flakiness Engine + Auto-Rerun',
          'pgvector HNSW sub-second semantic cache',
          'Slack & Discord instant incident alerts',
          '90-day signature analytics & trends',
        ],
      },
      {
        name: 'Team',
        desc: 'For scaling orgs requiring strict Postgres RLS isolation & AI budget governance.',
        monthly: 49,
        annual: 39,
        featured: false,
        cta: 'Deploy Team Workspace',
        features: [
          '10,000 CI failure diagnoses / month',
          'Multi-org Workspaces & Role-Based Access',
          'Atomic Postgres AI Budget & Quota Guard',
          'Priority Groq + NVIDIA NIM failover mesh',
          'Stripe self-serve billing & invoice sync',
          'Dedicated audit log & 99.98% SLA',
        ],
      },
    ],
    []
  );

  const flakinessTimeline = [1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1];

  return (
    <ClickSpark>
      <GlobalStyles />
      <div className="relative min-h-screen bg-[#08090d] text-[#e2e8f0] selection:bg-emerald-500/25 selection:text-emerald-100">
        {/* Subtle Matte Film Grain */}
        <div
          aria-hidden="true"
          className="film-grain pointer-events-none fixed inset-0 z-[1] opacity-50 mix-blend-overlay"
        />

        {/* FLOATING SLACK TOAST */}
        {slackToast && (
          <div className="animate-toast-in fixed right-4 top-20 z-[110] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0c0e15]/95 p-4 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:right-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <span>Slack Alert Dispatched</span>
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono-code text-[10px] text-emerald-300">
                      LIVE
                    </span>
                  </div>
                  <div className="font-mono-code text-[11px] text-zinc-400">
                    {slackToast.channel} • just now
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSlackToast(null)}
                className="rounded-md p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-3 rounded-xl border-l-2 border-emerald-400 bg-white/[0.03] px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-zinc-100 truncate">
                  {slackToast.repo} ({slackToast.pr})
                </span>
                <span className="font-mono-code text-[10px] text-amber-300 shrink-0">
                  {slackToast.badge}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">
                Root cause & unified patch posted to PR in{' '}
                <span className="font-mono-code text-emerald-300">{slackToast.latency}</span>.
              </p>
            </div>
          </div>
        )}

        {/* 1. FLOATING MATTE HEADER */}
        <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
          <nav className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0c0e15]/80 px-4 py-2.5 shadow-[0_16px_45px_-14px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:px-5">
            <div className="flex items-center gap-3">
              <a href="#" className="flex items-center gap-2.5 focus:outline-none">
                <HopperEmblem size={28} />
                <span className="text-[15px] font-bold tracking-tight text-white">Hopper</span>
              </a>
              <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-0.5 font-mono-code text-[10px] text-emerald-300 lg:inline-flex">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                <span>Engine v2.4 • 99.98%</span>
              </div>
            </div>

            <div className="hidden items-center gap-7 text-[13px] font-medium text-zinc-400 md:flex">
              <a href="#studio" className="transition-colors hover:text-white">
                Live Studio
              </a>
              <a href="#telemetry-lab" className="transition-colors hover:text-white">
                Telemetry Lab
              </a>
              <a href="#capabilities" className="transition-colors hover:text-white">
                Capabilities
              </a>
              <a href="#pipeline" className="transition-colors hover:text-white">
                Pipeline
              </a>
              <a href="#pricing" className="transition-colors hover:text-white">
                Pricing
              </a>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <Magnet padding={28} strength={0.22}>
                <button
                  type="button"
                  onClick={() => openInstallModal('Pro')}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_20px_-6px_rgba(16,185,129,0.4)] transition-all hover:border-emerald-400/50 hover:bg-emerald-500/15"
                >
                  <Github className="h-3.5 w-3.5 text-emerald-300" />
                  <span>Install GitHub App</span>
                </button>
              </Magnet>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-lg border border-white/10 p-2 text-zinc-300 hover:bg-white/5 md:hidden"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </nav>

          {mobileMenuOpen && (
            <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-white/10 bg-[#0c0e15]/95 p-4 shadow-2xl backdrop-blur-2xl md:hidden">
              <div className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                <a
                  href="#studio"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2 hover:bg-white/5"
                >
                  Live Studio
                </a>
                <a
                  href="#telemetry-lab"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2 hover:bg-white/5"
                >
                  Telemetry Lab
                </a>
                <a
                  href="#capabilities"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2 hover:bg-white/5"
                >
                  Capabilities
                </a>
                <a
                  href="#pipeline"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2 hover:bg-white/5"
                >
                  Pipeline
                </a>
                <a
                  href="#pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl px-3 py-2 hover:bg-white/5"
                >
                  Pricing
                </a>
                <div className="mt-2 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => openInstallModal('Pro')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950"
                  >
                    <Github className="h-4 w-4" />
                    Install GitHub App
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* 2. HERO SECTION */}
        <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
          <MatteMeshBackground />

          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex justify-center">
              <a
                href="#telemetry-lab"
                className="group inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-[#0c0e15]/80 px-4 py-1.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-colors hover:border-emerald-500/30"
              >
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <ShinyText
                  text="AI Gateway + pgvector HNSW • Sub-2s CI Failure Diagnosis"
                  className="text-xs sm:text-[13px]"
                />
                <ChevronRight className="h-3.5 w-3.5 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-400" />
              </a>
            </div>

            <div className="mx-auto mt-8 max-w-4xl text-center">
              <h1 className="tracking-obsidian text-4xl font-extrabold text-white sm:text-6xl lg:text-[66px] lg:leading-[1.12]">
                <BlurText text="Stop digging through 40,000 log lines." delay={55} />
                <span className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2.5">
                  <span className="text-zinc-100">Fix</span>
                  <RotatingText
                    words={['flaky tests', 'OOM crashes', 'broken builds', 'migration locks']}
                    interval={2400}
                  />
                  <span className="text-zinc-100">in seconds.</span>
                </span>
              </h1>

              <p className="mx-auto mt-7 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-[17px]">
                Hopper hooks directly into GitHub Actions webhooks, strips ANSI noise & scrubs
                secrets, fingerprints recurring failures, flags flaky patterns, and posts exact
                diff-grounded root-cause patches straight onto your Pull Request.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Magnet padding={40} strength={0.24}>
                  <StarBorder
                    onClick={() => openInstallModal('Hobby')}
                    rounded="rounded-xl"
                    className="cursor-pointer shadow-[0_0_36px_-10px_rgba(16,185,129,0.5)]"
                    innerClassName="bg-gradient-to-b from-[#111722] to-[#0a0d14] hover:from-[#151e2c] hover:to-[#0e121a] transition-all px-7 py-3.5 text-sm font-semibold text-white gap-2.5"
                  >
                    <Github className="h-4 w-4 text-emerald-400" />
                    <span>Install on GitHub — Free</span>
                    <ArrowRight className="h-4 w-4 text-cyan-400" />
                  </StarBorder>
                </Magnet>

                <button
                  type="button"
                  onClick={() => safeCopy('npx hopper-cli init', setCopiedCli)}
                  className="group inline-flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0d1017] px-5 py-3.5 font-mono-code text-xs text-zinc-300 backdrop-blur-xl transition-all hover:border-emerald-500/35 hover:bg-[#121622]"
                >
                  <span className="text-emerald-400">$</span>
                  <span>npx hopper-cli init</span>
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors group-hover:border-emerald-500/35 group-hover:text-emerald-300">
                    {copiedCli ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </span>
                </button>
              </div>
            </div>

            {/* 3. CENTERPIECE "CHAOS TO CLARITY" LIVE STUDIO */}
            <div id="studio" className="mt-16 scroll-mt-24 sm:mt-22">
              <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  {STUDIO_SCENARIOS.map((sc, idx) => {
                    const active = idx === scenarioIdx;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => handleSelectScenario(idx)}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                          active
                            ? 'border-emerald-500/40 bg-emerald-500/[0.1] text-white shadow-[0_0_20px_-8px_rgba(16,185,129,0.45)]'
                            : 'border-white/[0.07] bg-[#0d1017] text-zinc-400 hover:border-white/15 hover:text-zinc-200'
                        }`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: active ? sc.ringColor : '#52525b' }}
                        />
                        <span className="hidden sm:inline">{sc.tabTitle}</span>
                        <span className="sm:hidden">{sc.shortTitle}</span>
                        <span
                          className={`hidden rounded-md border px-1.5 py-0.5 font-mono-code text-[9px] font-semibold xl:inline-block ${sc.badgeStyle}`}
                        >
                          {sc.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setScrubberEnabled((v) => !v)}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                      scrubberEnabled
                        ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300'
                        : 'border-rose-500/35 bg-rose-500/[0.08] text-rose-300'
                    }`}
                    title="Toggle live secret redaction"
                  >
                    {scrubberEnabled ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                    <span>Secret Scrubber: {scrubberEnabled ? 'ACTIVE' : 'RAW PREVIEW'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={triggerDiagnosisReplay}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-emerald-500/15 via-cyan-500/15 to-violet-500/15 px-3.5 py-2 text-xs font-semibold text-white shadow-[0_0_20px_-6px_rgba(6,182,212,0.45)] transition-all hover:border-cyan-400/60"
                  >
                    <Play
                      className={`h-3.5 w-3.5 text-emerald-300 ${
                        isDiagnosing ? 'animate-pulse' : ''
                      }`}
                    />
                    <span>{isDiagnosing ? 'Diagnosing...' : 'Re-Diagnose'}</span>
                  </button>
                </div>
              </div>

              {/* Studio Shell */}
              <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0a0c12] shadow-[0_32px_90px_-24px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#090b10] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="font-mono-code text-xs text-zinc-400">
                      {scenario.repo} <span className="text-zinc-600">/</span>{' '}
                      <span className="text-zinc-200">{scenario.workflow}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 font-mono-code text-[11px]">
                    <span className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.08] px-2 py-0.5 text-emerald-300">
                      {scenario.compressionBadge}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-zinc-300">
                      {scenario.provider}
                    </span>
                  </div>
                </div>

                {/* Animated 5-Stage Ticker */}
                <div className="grid grid-cols-2 gap-2 border-b border-white/[0.07] bg-[#06070a] px-4 py-2.5 sm:grid-cols-3 lg:grid-cols-5">
                  {PIPELINE_STEPS_TICKER.map((step) => {
                    const done = activeTickerStep >= step.id;
                    const active = isDiagnosing && activeTickerStep === step.id;
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-all duration-200 ${
                          active
                            ? 'border-cyan-400/40 bg-cyan-500/[0.08] text-white shadow-[0_0_16px_-6px_rgba(6,182,212,0.4)]'
                            : done
                            ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-100'
                            : 'border-white/[0.04] bg-white/[0.01] text-zinc-500'
                        }`}
                      >
                        {active ? (
                          <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-cyan-400" />
                        ) : done ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                        ) : (
                          <Clock className="h-3 w-3 shrink-0 text-zinc-600" />
                        )}
                        <div className="min-w-0 truncate">
                          <div className="truncate text-[11px] font-semibold">{step.label}</div>
                          <div className="truncate font-mono-code text-[9px] text-zinc-400">
                            {step.detail}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Left Terminal / Right PR Comment */}
                <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-12">
                  <div className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#050609] lg:col-span-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-[#08090f] px-4 py-2.5">
                      <div className="flex items-center gap-2 font-mono-code text-xs text-zinc-400">
                        <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                        <span>github-actions.log</span>
                      </div>
                      <div>
                        {rerunStatus === 'passed' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono-code text-[10px] font-semibold text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            RERUN PASSED
                          </span>
                        ) : rerunStatus === 'running' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 font-mono-code text-[10px] font-semibold text-cyan-300">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            RERUNNING...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 font-mono-code text-[10px] font-semibold text-rose-300">
                            <XCircle className="h-3 w-3" />
                            CHECK FAILED
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 overflow-x-auto p-3.5 font-mono-code text-[11.5px] leading-6">
                      {scenario.logs.map((row) => (
                        <div
                          key={row.line}
                          className={`flex items-start gap-3 rounded px-2 py-0.5 ${
                            row.error
                              ? 'border-l-2 border-rose-500 bg-rose-500/[0.08] text-rose-200'
                              : 'text-zinc-400'
                          }`}
                        >
                          <span className="w-11 shrink-0 select-none text-right text-zinc-600">
                            {row.line}
                          </span>
                          <span className="break-all">
                            {row.text}
                            {row.rawSecret &&
                              (scrubberEnabled ? (
                                <span className="ml-1 inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-300 shadow-[0_0_10px_-3px_rgba(16,185,129,0.4)]">
                                  <Lock className="h-2.5 w-2.5" />
                                  [REDACTED_SECRET]
                                </span>
                              ) : (
                                <span className="ml-1 rounded border border-rose-500/35 bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-rose-200">
                                  {row.rawSecret}
                                </span>
                              ))}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-[#07080e] px-4 py-2 font-mono-code text-[11px]">
                      {scrubberEnabled ? (
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Zero credentials exposed to LLM
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-rose-400">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Raw secret preview mode
                        </span>
                      )}
                      <span className="text-zinc-500">-{scenario.noisePct} noise</span>
                    </div>
                  </div>

                  {/* PR Comment Card */}
                  <div className="lg:col-span-6">
                    <TiltedCard
                      maxTilt={3.5}
                      className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0d1017] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.85)]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] bg-[#090b10] px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <HopperEmblem size={22} />
                          <span className="text-xs font-bold text-white">hopper-bot</span>
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 font-mono-code text-[10px] text-zinc-300">
                            bot
                          </span>
                          <span className="hidden font-mono-code text-[11px] text-zinc-500 sm:inline">
                            PR {scenario.prNumber}
                          </span>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono-code text-[10px] font-semibold ${scenario.badgeStyle}`}
                        >
                          <Flame className="h-3 w-3" />
                          {scenario.badge}
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#07090f] p-3">
                            <div className="flex items-center gap-3">
                              <ConfidenceRing
                                value={scenario.confidence}
                                color={scenario.ringColor}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                                  <Fingerprint className="h-3 w-3 text-violet-400" />
                                  <DecryptedText
                                    text={scenario.fingerprint}
                                    triggerKey={decryptTrigger}
                                    className="text-zinc-200"
                                  />
                                </div>
                                <div className="mt-1 flex items-center gap-2 font-mono-code text-[10.5px]">
                                  <span className="text-emerald-400">{scenario.cacheLatency}</span>
                                  <span className="text-zinc-600">•</span>
                                  <span className="text-cyan-300">
                                    commit{' '}
                                    <DecryptedText
                                      text={scenario.commitSha}
                                      triggerKey={decryptTrigger}
                                    />
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                                <Sparkles className="h-3.5 w-3.5" />
                                Root Cause Diagnosis
                              </span>
                              <span className="font-mono-code text-[10px] text-zinc-500">
                                {scenario.commitFile}
                              </span>
                            </div>
                            <p className="text-xs leading-relaxed text-zinc-300 sm:text-[13px]">
                              {scenario.rootCause}
                            </p>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#050609]">
                            <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#07080d] px-3 py-1.5">
                              <span className="flex items-center gap-1.5 font-mono-code text-[11px] text-zinc-300">
                                <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
                                {scenario.patchFile}
                              </span>
                              <span className="font-mono-code text-[10px] text-zinc-500">
                                unified diff
                              </span>
                            </div>
                            <pre className="overflow-x-auto p-3 font-mono-code text-[11px] leading-5">
                              {scenario.patch.split('\n').map((line, i) => (
                                <div
                                  key={i}
                                  className={`px-1.5 ${
                                    line.startsWith('+')
                                      ? 'bg-emerald-500/12 text-emerald-300'
                                      : line.startsWith('-')
                                      ? 'bg-rose-500/12 text-rose-300'
                                      : 'text-zinc-400'
                                  }`}
                                >
                                  {line}
                                </div>
                              ))}
                            </pre>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
                          <button
                            type="button"
                            onClick={() => safeCopy(scenario.patch, setCopiedPatch)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-zinc-100 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200"
                          >
                            {copiedPatch ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Patch Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy Fix Patch</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleAutoRerun}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                              rerunStatus === 'passed'
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                                : rerunStatus === 'running'
                                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/18'
                            }`}
                          >
                            {rerunStatus === 'passed' ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Checks Green (Passed)</span>
                              </>
                            ) : rerunStatus === 'running' ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-300" />
                                <span>Re-running Job...</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-3.5 w-3.5" />
                                <span>Auto-Rerun Failed Jobs</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={handleTestSlackAlert}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-semibold text-violet-200 transition-all hover:border-violet-400/50 hover:bg-violet-500/18"
                          >
                            <Bell className="h-3.5 w-3.5 text-violet-300" />
                            <span>Test Slack Alert</span>
                          </button>
                        </div>
                      </div>
                    </TiltedCard>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. ECOSYSTEM STRIP */}
        <section className="relative z-10 border-y border-white/[0.07] bg-[#07080e]/90 py-8">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="mb-3 text-center font-mono-code text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Verified Integrations Across Your CI/CD & Observability Infrastructure
            </p>
            <LogoLoop items={ECOSYSTEM_LOGOS} />
          </div>
        </section>

        {/* ==============================================================
            5. ENHANCED TELEMETRY & OBSERVABILITY LAB SECTION
        ============================================================== */}
        <section id="telemetry-lab" className="relative z-10 scroll-mt-24 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-mono-code text-[11px] font-medium text-emerald-300">
                <Activity className="h-3.5 w-3.5" />
                CI OBSERVABILITY LAB
              </span>
              <h2 className="tracking-obsidian mt-4 text-3xl font-extrabold text-white sm:text-5xl">
                <BlurText text="High-Precision CI Diagnostics Telemetry" delay={50} />
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
                Interactive graphs showing Bayesian flakiness inference, high-dimensional vector
                signatures, 99.9% log volume reduction, and measurable engineering MTTR gains.
              </p>
            </div>

            {/* Telemetry Tab Switcher */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              {[
                { id: 'flakiness', label: 'Flakiness Probability Curve', icon: TrendingUp, color: '#F59E0B' },
                { id: 'vector', label: 'pgvector HNSW Semantic Map', icon: Cpu, color: '#8B5CF6' },
                { id: 'waterfall', label: '52MB Log Compression', icon: BarChart3, color: '#10B981' },
                { id: 'roi', label: 'MTTR Benchmark & ROI', icon: Gauge, color: '#06B6D4' },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTelemetryTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTelemetryTab(tab.id as any)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all ${
                      active
                        ? 'border-white/20 bg-[#121622] text-white shadow-lg'
                        : 'border-white/[0.07] bg-[#0d1017] text-zinc-400 hover:border-white/15 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" style={{ color: active ? tab.color : '#71717a' }} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Telemetry Graph Container */}
            <div className="mt-8">
              {activeTelemetryTab === 'flakiness' && <EnhancedFlakinessGraph />}
              {activeTelemetryTab === 'vector' && <EnhancedVectorClusterGraph />}
              {activeTelemetryTab === 'waterfall' && <EnhancedLogWaterfallGraph />}
              {activeTelemetryTab === 'roi' && <EnhancedMttrRoiCalculator />}
            </div>
          </div>
        </section>

        {/* 6. SYSTEM CAPABILITIES BENTO GRID */}
        <section id="capabilities" className="relative z-10 scroll-mt-24 border-t border-white/[0.07] py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 font-mono-code text-[11px] font-medium text-emerald-300">
                <Layers className="h-3.5 w-3.5" />
                SYSTEM CAPABILITIES
              </span>
              <h2 className="tracking-obsidian mt-4 text-3xl font-extrabold text-white sm:text-5xl">
                <BlurText text="Engineered for Real-World CI Chaos" delay={50} />
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
                Interactive, battle-tested primitives that strip noise, isolate flaky tests, and
                keep every tenant’s credentials locked inside your perimeter.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
              {/* Card 1: Secret Scrubber */}
              <SpotlightCard className="md:col-span-2">
                <div className="flex h-full flex-col justify-between p-6 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <h3 className="mt-4 text-xl font-bold text-white">
                        Secret Scrubber & Smart Log Slicer
                      </h3>
                      <p className="mt-2 max-w-xl text-sm text-zinc-400">
                        Deterministic 320KB ring-buffer slicing removes 98.4% of passing build noise
                        while redacting API keys, JWTs, and connection strings before AI inference.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBentoScrubbed((s) => !s)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono-code text-[11px] font-semibold transition-colors ${
                        bentoScrubbed
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-rose-500/35 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      {bentoScrubbed ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      <span>{bentoScrubbed ? 'Redacted' : 'Inspect Raw'}</span>
                    </button>
                  </div>

                  <div className="mt-6 space-y-3 rounded-xl border border-white/[0.07] bg-[#06070c] p-4 font-mono-code text-[11.5px]">
                    <div className="flex flex-wrap items-center gap-2 text-zinc-400">
                      <span className="text-zinc-600">01</span>
                      <span>GH_PAT=</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                          bentoScrubbed
                            ? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-300'
                            : 'border border-rose-500/25 bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {bentoScrubbed ? 'ghp_***[REDACTED]' : 'ghp_9xK2mPq7vN4rT1wZ'}
                      </span>
                      <span className="ml-2">STRIPE_KEY=</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                          bentoScrubbed
                            ? 'border border-emerald-500/25 bg-emerald-500/15 text-emerald-300'
                            : 'border border-rose-500/25 bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {bentoScrubbed ? 'sk_live_***[REDACTED]' : 'sk_live_51P9xK2L9a8M0n'}
                      </span>
                    </div>

                    <div className="pt-1">
                      <div className="mb-1.5 flex items-center justify-between text-[10.5px]">
                        <span className="text-zinc-400">Token Compression Ratio</span>
                        <span className="font-semibold text-emerald-400">98.4% noise removed</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full w-[98.4%] rounded-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-300" />
                      </div>
                    </div>
                  </div>
                </div>
              </SpotlightCard>

              {/* Card 2: Flakiness Engine */}
              <SpotlightCard>
                <div className="flex h-full flex-col justify-between p-6 sm:p-7">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                      <RefreshCw className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">
                      Cross-Run Flakiness Engine
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                      Tracks normalized SHA-256 failure signatures across branches to quarantine
                      chronic flakes automatically.
                    </p>
                  </div>

                  <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#06070c] p-3.5">
                    <div className="flex items-center justify-between font-mono-code text-[10.5px]">
                      <span className="text-zinc-400">Last 16 Runs</span>
                      <span className="font-bold text-amber-300">Flake Score: 68%</span>
                    </div>
                    <div className="mt-2.5 grid grid-cols-16 gap-1">
                      {flakinessTimeline.map((ok, i) => (
                        <div
                          key={i}
                          className={`h-6 rounded-[3px] transition-transform hover:scale-110 ${
                            ok ? 'bg-emerald-500/60' : 'bg-rose-500/75'
                          }`}
                          title={`Run #${9127 + i}: ${ok ? 'Passed' : 'Failed'}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 font-mono-code text-[10px]">
                      <span className="text-zinc-500">checkout.spec.ts</span>
                      <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                        AUTO-QUARANTINED
                      </span>
                    </div>
                  </div>
                </div>
              </SpotlightCard>

              {/* Card 3: AI Gateway */}
              <SpotlightCard>
                <div className="flex h-full flex-col justify-between p-6 sm:p-7">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-400">
                      <Cpu className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">Resilient AI Gateway</h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                      Multi-provider LLM mesh with circuit breakers, bulkhead isolation, and
                      pgvector semantic caching.
                    </p>
                  </div>

                  <div className="mt-6 space-y-2 rounded-xl border border-white/[0.07] bg-[#06070c] p-3.5 font-mono-code text-[10.5px]">
                    <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
                      <span className="text-zinc-200">1. Groq Llama-3.3</span>
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-300">
                        CLOSED • 410ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
                      <span className="text-zinc-200">2. NVIDIA NIM</span>
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-300">
                        CLOSED • STANDBY
                      </span>
                    </div>
                    <div className="pt-1">
                      <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                        <span>pgvector Cache Hit Rate</span>
                        <span className="text-violet-300">74%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full w-[74%] rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </SpotlightCard>

              {/* Card 4: PR Reporter */}
              <SpotlightCard>
                <div className="flex h-full flex-col justify-between p-6 sm:p-7">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                      <GitPullRequest className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">Zero-Noise PR Reporter</h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                      Posts one clean upserted comment and inline GitHub Check Run annotations
                      pointing to the exact offending line.
                    </p>
                  </div>

                  <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#06070c] p-3.5 font-mono-code text-[10.5px]">
                    <div className="flex items-center justify-between text-zinc-400">
                      <span className="truncate text-cyan-300">checkout.spec.ts:74</span>
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] text-rose-300">
                        ANNOTATION
                      </span>
                    </div>
                    <div className="mt-2 rounded-lg border-l-2 border-cyan-400 bg-cyan-500/[0.05] px-2.5 py-2 text-[10.5px] leading-relaxed text-zinc-300">
                      Await `toBeEnabled()` before click to prevent iframe hydration timeout.
                    </div>
                  </div>
                </div>
              </SpotlightCard>

              {/* Card 5: Chat Alerts */}
              <SpotlightCard>
                <div className="flex h-full flex-col justify-between p-6 sm:p-7">
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                      <Bell className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-white">Slack & Discord Alerts</h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
                      High-signal embeds routed to owning channels with one-click thread fixes and
                      flaky-test suppression.
                    </p>
                  </div>

                  <div className="mt-6 rounded-xl border border-white/[0.07] bg-[#06070c] p-3.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-white">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span>#eng-ci-alerts</span>
                      <span className="font-mono-code text-[9.5px] text-zinc-500">18:41</span>
                    </div>
                    <div className="mt-2 rounded-lg border-l-2 border-emerald-400 bg-white/[0.02] p-2.5 text-[10.5px] text-zinc-300">
                      <div className="font-semibold text-white">PR #418 diagnosed in 180ms</div>
                      <div className="mt-1 flex items-center gap-2 font-mono-code text-[9.5px] text-emerald-300">
                        <span>→ View Patch</span>
                        <span className="text-zinc-600">|</span>
                        <button
                          type="button"
                          onClick={handleTestSlackAlert}
                          className="cursor-pointer underline decoration-emerald-500/40 hover:text-white"
                        >
                          Trigger Live Preview
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </SpotlightCard>

              {/* Card 6: Enterprise RLS */}
              <SpotlightCard className="md:col-span-3">
                <div className="grid grid-cols-1 items-center gap-6 p-6 sm:p-7 lg:grid-cols-12">
                  <div className="lg:col-span-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
                      <Database className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-white">
                      Enterprise Multi-Tenant RLS & Quota Guard
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                      Hardened Postgres Row-Level Security isolates every workspace’s logs, vector
                      embeddings, and failure signatures—backed by atomic AI budget ledgers and
                      Stripe webhook synchronization.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-7">
                    <div className="rounded-xl border border-white/[0.07] bg-[#06070c] p-4">
                      <div className="flex items-center justify-between">
                        <Lock className="h-4 w-4 text-emerald-400" />
                        <span className="font-mono-code text-[10px] text-emerald-300">ENFORCED</span>
                      </div>
                      <div className="mt-3 text-xs font-bold text-white">Postgres Leaf RLS</div>
                      <p className="mt-1 font-mono-code text-[10.5px] text-zinc-500">
                        workspace_id = current_setting(&apos;app.ws&apos;)
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/[0.07] bg-[#06070c] p-4">
                      <div className="flex items-center justify-between">
                        <Activity className="h-4 w-4 text-cyan-400" />
                        <span className="font-mono-code text-[10px] text-cyan-300">ATOMIC</span>
                      </div>
                      <div className="mt-3 text-xs font-bold text-white">AI Budget Ledger</div>
                      <p className="mt-1 font-mono-code text-[10.5px] text-zinc-500">
                        Per-org token cap & graceful fallback
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/[0.07] bg-[#06070c] p-4">
                      <div className="flex items-center justify-between">
                        <CreditCard className="h-4 w-4 text-violet-400" />
                        <span className="font-mono-code text-[10px] text-violet-300">SYNCED</span>
                      </div>
                      <div className="mt-3 text-xs font-bold text-white">Stripe Quota Guard</div>
                      <p className="mt-1 font-mono-code text-[10.5px] text-zinc-500">
                        Real-time metered plan webhooks
                      </p>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </div>
          </div>
        </section>

        {/* 7. PIPELINE EXPLORER */}
        <section id="pipeline" className="relative z-10 scroll-mt-24 border-y border-white/[0.07] bg-[#07080f] py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 font-mono-code text-[11px] font-medium text-cyan-300">
                <Zap className="h-3.5 w-3.5" />
                INTERACTIVE PIPELINE EXPLORER
              </span>
              <h2 className="tracking-obsidian mt-4 text-3xl font-extrabold text-white sm:text-5xl">
                <BlurText text="From Failed Webhook to PR Patch" delay={50} />
              </h2>
              <p className="mt-4 text-sm text-zinc-400 sm:text-base">
                Inspect every deterministic stage of Hopper’s architecture and real-world latency envelope.
              </p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_EXPLORER_STAGES.map((st, idx) => {
                const Icon = st.icon;
                const selected = idx === explorerIdx;
                return (
                  <div key={st.num} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setExplorerIdx(idx)}
                      className={`group relative w-full cursor-pointer rounded-2xl border p-5 text-left transition-all duration-300 ${
                        selected
                          ? 'border-emerald-500/40 bg-[#101420] shadow-[0_0_30px_-10px_rgba(16,185,129,0.4)]'
                          : 'border-white/[0.07] bg-[#0d1017] hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-mono-code text-xs font-bold ${
                            selected ? 'text-emerald-400' : 'text-zinc-500'
                          }`}
                        >
                          {st.num}.
                        </span>
                        <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono-code text-[10px] text-zinc-300">
                          {st.latency}
                        </span>
                      </div>
                      <div className="mt-3.5 flex items-center gap-2.5">
                        <Icon
                          className="h-4 w-4 transition-colors"
                          style={{ color: selected ? st.accent : '#9ca3af' }}
                        />
                        <span className="text-sm font-bold text-white">{st.shortTitle}</span>
                      </div>
                    </button>

                    {idx < PIPELINE_EXPLORER_STAGES.length - 1 && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none hidden w-5 shrink-0 overflow-hidden lg:block"
                      >
                        <div className="relative h-[2px] w-full bg-white/10">
                          <div className="pulse-beam absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-400 to-cyan-400" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              <SpotlightCard>
                <div className="grid grid-cols-1 gap-8 p-6 sm:p-8 lg:grid-cols-12">
                  <div className="lg:col-span-6">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono-code text-[11px] font-bold text-emerald-300">
                        STAGE {activeExplorer.num}
                      </span>
                      <span className="font-mono-code text-xs text-zinc-400">
                        Latency: {activeExplorer.latency}
                      </span>
                    </div>

                    <h3 className="mt-4 text-2xl font-bold text-white">{activeExplorer.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                      {activeExplorer.description}
                    </p>

                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {activeExplorer.metrics.map((m) => (
                        <div
                          key={m.label}
                          className="rounded-xl border border-white/[0.06] bg-[#06070c] px-3.5 py-3"
                        >
                          <div className="font-mono-code text-[10px] uppercase tracking-wider text-zinc-500">
                            {m.label}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-zinc-100">{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-center lg:col-span-6">
                    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#050609] shadow-inner">
                      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#07080d] px-4 py-2.5">
                        <span className="flex items-center gap-2 font-mono-code text-xs text-zinc-300">
                          <Code2 className="h-3.5 w-3.5 text-cyan-400" />
                          {activeExplorer.codeLang}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono-code text-[10px] text-emerald-400">
                          <Radio className="h-3 w-3 animate-pulse" />
                          TELEMETRY VERIFIED
                        </span>
                      </div>
                      <pre className="overflow-x-auto p-4 font-mono-code text-xs leading-6 text-emerald-300/90">
                        {activeExplorer.code}
                      </pre>
                    </div>
                  </div>
                </div>
              </SpotlightCard>
            </div>
          </div>
        </section>

        {/* 8. IMPACT STATS */}
        <section className="relative z-10 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-6 text-center backdrop-blur-xl">
                <div className="tracking-obsidian text-3xl font-extrabold text-emerald-400 sm:text-5xl">
                  <CountUp to={98.4} decimals={1} suffix="%" />
                </div>
                <div className="mt-2 text-xs font-medium text-zinc-400 sm:text-sm">
                  Log Noise Stripped
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-6 text-center backdrop-blur-xl">
                <div className="tracking-obsidian text-3xl font-extrabold text-white sm:text-5xl">
                  <CountUp to={1.4} decimals={1} suffix="s" />
                </div>
                <div className="mt-2 text-xs font-medium text-zinc-400 sm:text-sm">
                  Median Cached Diagnosis
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-6 text-center backdrop-blur-xl">
                <div className="tracking-obsidian text-3xl font-extrabold text-cyan-400 sm:text-5xl">
                  <CountUp to={0} />
                </div>
                <div className="mt-2 text-xs font-medium text-zinc-400 sm:text-sm">
                  Leaked Secrets in Prompts
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.07] bg-[#0d1017] p-6 text-center backdrop-blur-xl">
                <div className="tracking-obsidian text-3xl font-extrabold text-violet-400 sm:text-5xl">
                  <CountUp to={100} suffix="%" />
                </div>
                <div className="mt-2 text-xs font-medium text-zinc-400 sm:text-sm">
                  Postgres RLS Isolation
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 9. PRICING */}
        <section id="pricing" className="relative z-10 scroll-mt-24 border-t border-white/[0.07] py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 px-3 py-1 font-mono-code text-[11px] font-medium text-violet-300">
                USAGE-ALIGNED PRICING
              </span>
              <h2 className="tracking-obsidian mt-4 text-3xl font-extrabold text-white sm:text-5xl">
                <BlurText text="Scale Green Builds, Not CI Bills" delay={50} />
              </h2>
              <p className="mt-4 text-sm text-zinc-400 sm:text-base">
                Start free on GitHub. Upgrade any time with instant Stripe billing sync.
              </p>

              <div className="mt-8 inline-flex items-center rounded-full border border-white/[0.08] bg-[#0d1017] p-1.5 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => setAnnualBilling(false)}
                  className={`cursor-pointer rounded-full px-5 py-2 text-xs font-semibold transition-all duration-300 ${
                    !annualBilling
                      ? 'bg-white text-zinc-950 shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setAnnualBilling(true)}
                  className={`flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold transition-all duration-300 ${
                    annualBilling
                      ? 'bg-emerald-500 text-zinc-950 shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>Annual</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono-code text-[10px] font-bold ${
                      annualBilling
                        ? 'bg-zinc-950/20 text-zinc-950'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    20% OFF
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
              {pricingTiers.map((tier) => {
                const price = annualBilling ? tier.annual : tier.monthly;

                const card = (
                  <SpotlightCard
                    className={`h-full ${tier.featured ? 'border-transparent bg-[#0e121d]' : ''}`}
                  >
                    <div className="flex h-full flex-col justify-between p-7">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                          {tier.badge && (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px]">
                              <ShinyText text={tier.badge} />
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-zinc-400">{tier.desc}</p>

                        <div className="mt-6 flex items-baseline gap-1.5">
                          <span className="tracking-obsidian text-4xl font-extrabold text-white tabular-nums sm:text-5xl">
                            ${price}
                          </span>
                          <span className="text-xs text-zinc-500">/ mo</span>
                          {annualBilling && tier.monthly > 0 && (
                            <span className="ml-2 font-mono-code text-xs text-zinc-500 line-through">
                              ${tier.monthly}
                            </span>
                          )}
                        </div>

                        <ul className="mt-7 space-y-3">
                          {tier.features.map((feat) => (
                            <li
                              key={feat}
                              className="flex items-start gap-2.5 text-xs text-zinc-300 sm:text-[13px]"
                            >
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="mt-8">
                        <button
                          type="button"
                          onClick={() => openInstallModal(tier.name)}
                          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-all sm:text-sm ${
                            tier.featured
                              ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_24px_-6px_rgba(16,185,129,0.55)] hover:bg-emerald-400'
                              : 'border border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.08]'
                          }`}
                        >
                          <Github className="h-4 w-4" />
                          <span>{tier.cta}</span>
                        </button>
                      </div>
                    </div>
                  </SpotlightCard>
                );

                return tier.featured ? (
                  <StarBorder
                    key={tier.name}
                    rounded="rounded-2xl"
                    className="w-full shadow-[0_0_45px_-16px_rgba(16,185,129,0.4)]"
                    innerClassName="h-full w-full bg-[#0e121d]"
                  >
                    {card}
                  </StarBorder>
                ) : (
                  <div key={tier.name}>{card}</div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 10. FINAL CTA */}
        <section className="relative z-10 px-4 pb-20 sm:px-6">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/[0.09] bg-[#0d1017] px-6 py-16 text-center shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95)] backdrop-blur-2xl sm:px-12 sm:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-0 h-72 w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 blur-[100px]"
            />

            <div className="relative z-10">
              <h2 className="tracking-obsidian text-3xl font-extrabold text-white sm:text-5xl">
                <BlurText text="Turn every red build into an instant fix." delay={50} />
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
                Connect the Hopper GitHub App in under 60 seconds. Zero workflow YAML edits—just
                instant root-cause patches on your next failed run.
              </p>

              <div className="mt-8 flex justify-center">
                <Magnet padding={40} strength={0.25}>
                  <StarBorder
                    onClick={() => openInstallModal('Pro')}
                    rounded="rounded-xl"
                    className="cursor-pointer shadow-[0_0_40px_-10px_rgba(16,185,129,0.55)]"
                    innerClassName="bg-[#0e1420] hover:bg-[#131b2a] transition-colors px-8 py-4 text-sm font-semibold text-white gap-2.5"
                  >
                    <Github className="h-4 w-4 text-emerald-400" />
                    <span>Install Hopper on GitHub</span>
                    <ArrowRight className="h-4 w-4 text-cyan-400" />
                  </StarBorder>
                </Magnet>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative z-10 border-t border-white/[0.07] bg-[#06070a] pt-12 pb-28 md:pb-32">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <div className="flex items-center gap-2.5">
                <HopperEmblem size={24} />
                <span className="text-sm font-bold text-white">Hopper</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Automated CI/CD failure diagnosis engine, flakiness heuristics & AI gateway.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-zinc-400">
              <a href="#studio" className="transition-colors hover:text-white">
                Live Studio
              </a>
              <a href="#telemetry-lab" className="transition-colors hover:text-white">
                Telemetry Lab
              </a>
              <a href="#capabilities" className="transition-colors hover:text-white">
                Capabilities
              </a>
              <a href="#pipeline" className="transition-colors hover:text-white">
                Pipeline
              </a>
              <a href="#pricing" className="transition-colors hover:text-white">
                Pricing
              </a>
              <button
                type="button"
                onClick={() => openInstallModal('Pro')}
                className="cursor-pointer transition-colors hover:text-white"
              >
                Install App
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1 font-mono-code text-[11px] text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span>All Systems Operational</span>
            </div>
          </div>
        </footer>

        {/* BOTTOM DOCK */}
        <Dock items={dockItems} />

        {/* INSTALL MODAL */}
        {installModalOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onClick={() => setInstallModalOpen(false)}
          >
            <div
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0c0f18]/95 shadow-[0_32px_90px_-15px_rgba(0,0,0,0.98)] backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div className="flex items-center gap-3">
                  <HopperEmblem size={26} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">Install Hopper on GitHub</h3>
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono-code text-[10px] font-semibold text-emerald-300">
                        {selectedPlan} Plan
                      </span>
                    </div>
                    <p className="font-mono-code text-[11px] text-zinc-400">
                      Zero YAML edits • Read-only streaming log analysis
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInstallModalOpen(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
                  aria-label="Close install modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5">
                {installPhase === 'configure' && (
                  <div className="space-y-5">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        <span>Select Repositories</span>
                        <span className="font-mono-code text-emerald-400">
                          {Object.values(modalRepos).filter(Boolean).length} selected
                        </span>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(modalRepos).map(([repo, checked]) => (
                          <label
                            key={repo}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.07] bg-[#070910] px-3.5 py-2.5 transition-colors hover:border-emerald-500/30"
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setModalRepos((prev) => ({ ...prev, [repo]: !prev[repo] }))
                                }
                                className="h-4 w-4 rounded border-white/20 bg-zinc-900 accent-emerald-500"
                              />
                              <span className="font-mono-code text-xs text-zinc-200">{repo}</span>
                            </div>
                            <span className="font-mono-code text-[10px] text-zinc-500">
                              Actions Enabled
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setModalOptions((o) => ({ ...o, slackAlerts: !o.slackAlerts }))
                        }
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                          modalOptions.slackAlerts
                            ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                            : 'border-white/[0.07] bg-[#070910]'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">Slack Alerts</div>
                          <div className="text-[10.5px] text-zinc-400">Instant failure embeds</div>
                        </div>
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            modalOptions.slackAlerts ? 'bg-emerald-400' : 'bg-zinc-600'
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setModalOptions((o) => ({ ...o, autoRerunFlaky: !o.autoRerunFlaky }))
                        }
                        className={`flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                          modalOptions.autoRerunFlaky
                            ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                            : 'border-white/[0.07] bg-[#070910]'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">Auto-Rerun Flakes</div>
                          <div className="text-[10.5px] text-zinc-400">Retry confirmed flakes</div>
                        </div>
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            modalOptions.autoRerunFlaky ? 'bg-emerald-400' : 'bg-zinc-600'
                          }`}
                        />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleAuthorizeInstall}
                      disabled={Object.values(modalRepos).filter(Boolean).length === 0}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_24px_-6px_rgba(16,185,129,0.55)] transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Github className="h-4 w-4" />
                      <span>
                        Authorize & Install ({Object.values(modalRepos).filter(Boolean).length}{' '}
                        repos)
                      </span>
                    </button>
                  </div>
                )}

                {installPhase === 'installing' && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="relative flex h-14 w-14 items-center justify-center">
                      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
                      <RefreshCw className="h-7 w-7 animate-spin text-emerald-400" />
                    </div>
                    <div className="mt-5 text-sm font-bold text-white">
                      Provisioning GitHub App Webhooks...
                    </div>
                    <div className="mt-1 font-mono-code text-xs text-zinc-400">
                      Binding HMAC-SHA256 secret & Postgres RLS workspace boundary
                    </div>
                  </div>
                )}

                {installPhase === 'done' && (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 shadow-[0_0_24px_-5px_rgba(16,185,129,0.5)]">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h4 className="mt-4 text-base font-bold text-white">
                      Hopper ({selectedPlan}) is Live!
                    </h4>
                    <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-400">
                      GitHub webhooks are active on{' '}
                      <span className="font-semibold text-zinc-200">
                        {Object.values(modalRepos).filter(Boolean).length} repositories
                      </span>
                      . Your next failing Actions job will receive an instant diff-grounded PR
                      diagnosis.
                    </p>
                    <div className="mt-4 w-full space-y-1.5 rounded-xl border border-white/[0.08] bg-[#06070c] p-3 text-left font-mono-code text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">webhook_status</span>
                        <span className="text-emerald-400">ACTIVE (HMAC-SHA256)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">secret_scrubber</span>
                        <span className="text-emerald-400">ENABLED (42+ rules)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">auto_rerun_flaky</span>
                        <span className="text-cyan-300">
                          {modalOptions.autoRerunFlaky ? 'ENABLED' : 'OFF'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInstallModalOpen(false)}
                      className="mt-5 w-full cursor-pointer rounded-xl border border-white/12 bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.1]"
                    >
                      Return to Hopper
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ClickSpark>
  );
};

export default LandingPage;
