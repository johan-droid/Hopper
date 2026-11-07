import React from 'react';

interface DotGridBackgroundProps {
  className?: string;
  glowColor?: 'crimson' | 'cyan' | 'both';
}

/**
 * DotGridBackground
 * A high-performance, dark-first SVG background grid with ambient glow inspired by Linear & Raycast.
 * Zero external libraries, purely CSS/SVG based, respects prefers-reduced-motion.
 */
export const DotGridBackground: React.FC<DotGridBackgroundProps> = ({
  className = '',
  glowColor = 'both',
}) => {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none ${className}`}
      aria-hidden="true"
    >
      {/* Subtle Dot Grid Pattern */}
      <svg
        className="absolute inset-0 h-full w-full stroke-hairline opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="hopper-dot-grid"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
            patternContentUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" className="fill-ink-muted/30" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" strokeWidth="0" fill="url(#hopper-dot-grid)" />
      </svg>

      {/* Ambient Crimson Glow (Top Left / Brand Accent) */}
      {(glowColor === 'crimson' || glowColor === 'both') && (
        <div
          className="absolute -top-[20%] -left-[10%] h-[550px] w-[550px] rounded-full bg-danger/10 blur-[130px] motion-safe:animate-pulse [animation-duration:8s]"
          style={{ willChange: 'opacity' }}
        />
      )}

      {/* Ambient Accent Glow (Bottom Right / Cyan Accent) */}
      {(glowColor === 'cyan' || glowColor === 'both') && (
        <div
          className="absolute -bottom-[20%] -right-[10%] h-[500px] w-[500px] rounded-full bg-accent/10 blur-[120px]"
          style={{ willChange: 'opacity' }}
        />
      )}

      {/* Center Subtle Vignette */}
      <div className="absolute inset-0 bg-radial-vignette opacity-60" />
    </div>
  );
};

export default DotGridBackground;
