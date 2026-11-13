# HOPPER — Design System & Visual Identity Specification

**Author**: Hopper Principal Frontend Architect & Design Systems Engineer  
**Repository**: `johan-droid/Hopper`  
**Date**: November 2026  
**Status**: APPROVED / SPECIFICATION  

---

## 1. Visual Direction & Identity: "The Industrial Observatory"

### Core Decision: Dark-First with Technical Precision Surfaces
The user posed a foundational design question:
> *Should Hopper have a predominantly dark interface, or a light interface with dark technical/product sections? My instinct is dark-first for Hopper, but the important thing is to make it distinctive rather than another black-background AI dashboard.*

### Architectural Resolution
**Hopper is dark-first by default**, adopting an **Industrial Observatory** aesthetic inspired by the restrained clarity of **Linear**, the technical confidence of **Vercel**, and the technical visualization craft of **Stripe**.

#### Why Dark-First:
1. **Engineers' Native Habitat**: CI/CD logs, terminals, stack traces, and code diffs live in dark environments. A light marketing page followed by a sudden dark terminal creates visual dissonance and eye strain.
2. **Distinctive Slate vs. Pitch-Black AI Slop**: Generic AI SaaS templates rely on pitch-black (`#000000`) canvases covered in purple/violet amorphous glowing blobs and low-contrast grey text. Hopper rejects this trope completely.
3. **The Obsidian & Cyan Palette**: Hopper uses a rich, atmospheric obsidian-slate foundation (`#0A0F1D`) paired with precision hairline borders (`rgba(255, 255, 255, 0.08)`), high-contrast crisp typography, and an electric cyan accent (`#06B6D4` / `#22D3EE`). Crimson (`#F43F5E`) and amber (`#F59E0B`) are reserved exclusively for semantic error and flakiness states.

---

## 2. Color Tokens & Semantic Roles

All tokens are defined in `globals.css` and mapped directly through Tailwind (`tailwind.config.js`):

```css
:root {
  color-scheme: dark;

  /* Surfaces */
  --surface-canvas: 10 15 29;     /* #0A0F1D: Deep Obsidian Slate Background */
  --surface-raised: 15 21 35;     /* #0F1523: Cards, Panels, Sidebars */
  --surface-overlay: 21 30 50;    /* #151E32: Dropdowns, Hover States, Dialogs */
  --surface-inset: 6 9 19;        /* #060913: Terminal Consoles, Inset Code Wells */

  /* Text & Ink */
  --text-primary: 248 250 252;    /* #F8FAFC: Slate-50 - Primary Headings & High-contrast Text */
  --text-secondary: 148 163 184;  /* #94A3B8: Slate-400 - Body Prose & Secondary Information */
  --text-muted: 100 116 139;      /* #64748B: Slate-500 - Timestamps, Line Numbers, Metadata */

  /* Borders & Dividers */
  --border-subtle: 255 255 255;
  --border-subtle-alpha: 0.08;    /* 8% White: Crisp, non-intrusive structural lines */
  --border-strong-alpha: 0.16;    /* 16% White: Active borders, focused inputs, card highlights */

  /* Brand & Status Accents */
  --accent: 6 182 212;            /* #06B6D4: Cyan-500 - Primary Brand Interaction */
  --accent-contrast: 8 15 25;     /* #080F19: Dark Navy - High-contrast text on Cyan buttons */
  --success: 16 185 129;          /* #10B981: Emerald - Passing runs, healthy dependencies */
  --warning: 245 158 11;          /* #F59E0B: Amber - Flakiness alert, retries, degradation */
  --danger: 244 63 94;            /* #F43F5E: Rose - Test failures, build errors, critical events */
  --info: 59 130 246;             /* #3B82F6: Blue - Informational notices, documentation links */

  /* Radii */
  --radius-sm: 6px;               /* Badges, inline code, small buttons */
  --radius-md: 10px;              /* Standard buttons, input fields, cards */
  --radius-lg: 14px;              /* Large feature panels, modal dialogs */

  /* Shadows */
  --shadow-raised: 0 1px 2px rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.6);
  --shadow-glow: 0 0 30px -10px rgb(6 182 212 / 0.15);
}
```

---

## 3. Typography Scale & Rules

Hopper employs a dual-typeface system:
1. **Sans-Serif (`Inter`)**: Clean, neutral, highly legible at both micro and display scales.
2. **Monospace (`JetBrains Mono`)**: Tailored for code readability, stack traces, hex hashes, and CLI reproduction commands.

| Element | Font Family | Size | Weight | Tracking | Line Height | Usage |
|---|---|---|---|---|---|---|
| **Display Hero** | Inter | `40px` – `56px` | `600` (SemiBold) | `-0.03em` | `1.15` | Landing Hero Headline |
| **Section Title** | Inter | `24px` – `32px` | `600` (SemiBold) | `-0.02em` | `1.25` | Major Section Headers |
| **Card Title** | Inter | `15px` – `17px` | `600` (SemiBold) | `-0.01em` | `1.4` | Component & Feature Headers |
| **Body Large** | Inter | `16px` – `18px` | `400` (Regular) | `0` | `1.6` | Hero Subtitles, Section Intros |
| **Body Regular** | Inter | `13px` – `14px` | `400` (Regular) | `0` | `1.55` | General UI Text, Explanations |
| **Metadata / Caption** | Inter | `11px` – `12px` | `500` (Medium) | `0.02em` | `1.4` | Table Headers, Timestamps, Labels |
| **Console Monospace** | JetBrains Mono | `12px` – `13px` | `400` / `500` | `0` | `1.65` | Log Lines, Stack Frames, Git SHAs |
| **CLI / Kbd Monospace** | JetBrains Mono | `11px` – `12px` | `500` (Medium) | `0` | `1.2` | Copyable CLI commands, shortcuts |

---

## 4. Spacing, Layout & Responsive Constraints

- **Container Constraint**: `max-w-6xl` (`1152px`) for content readability and dashboard layouts; `max-w-4xl` for focused text sections.
- **Horizontal Margins**:
  - Mobile (`< 640px`): `px-4` (`16px`)
  - Tablet (`640px – 1024px`): `px-6` (`24px`)
  - Desktop (`> 1024px`): `px-8` (`32px`)
- **Vertical Rhythm**:
  - Hero spacing: `pt-16 pb-12` (mobile), `pt-24 pb-20` (desktop).
  - Section spacing: `py-16` (mobile), `py-24` (desktop).
  - Component gaps: `gap-4` (`16px`) for cards; `gap-6` (`24px`) for feature grids.

---

## 5. Component Patterns & Interaction Guidelines

### 5.1 Buttons
- **Primary Button**: Solid Cyan (`bg-accent text-accent-contrast`), subtle elevation. Used for primary conversion (`Start with GitHub`, `Open Dashboard`).
- **Secondary Button**: Translucent Overlay with hairline border (`bg-overlay text-ink border border-hairline hover:bg-overlay/80`). Used for secondary paths (`Live Demo`, `Docs`).
- **Ghost Button**: Transparent with text hover highlight (`text-ink-secondary hover:text-ink hover:bg-overlay/50`).

### 5.2 Technical Inset Consoles (Terminals)
- Background: `--surface-inset` (`#060913`).
- Border: `1px solid rgba(255, 255, 255, 0.08)`.
- Header: Subtle traffic light indicator dots (muted opacity), file or job path, and action tools (Copy, Wrap, Expand).
- Line Numbers: Monospace, `--text-muted`, right-aligned with fixed gutter.
- Failure Highlighting: Error lines highlighted with a subtle rose background tint (`bg-danger/10 text-danger border-l-2 border-danger`).

### 5.3 Badges & Chips
- Crisp 1-pixel hairline borders with 10% semantic tint (`bg-accent/10 text-accent border-accent/25`).
- Small, uppercase, or monospace typography with `px-2 py-0.5` padding.

### 5.4 Motion & Transitions
- Transition speeds:
  - Fast (`120ms`): Hover states, button clicks, icon rotations.
  - Base (`180ms`): Modal popups, tab switching, dropdown reveals.
  - Easing: `cubic-bezier(0.2, 0, 0, 1)` (Raycast-inspired sharp deceleration).
- **Reduced Motion**: Any user setting `prefers-reduced-motion: reduce` completely bypasses CSS transitions and keyframes.

---

## 6. Implementation Guardrails

1. **Zero Layout Shifts (CLS)**: Fixed aspect ratios or min-height placeholders for all dynamic/interactive inspector panels.
2. **Touch Targets**: All buttons, links, and tab controls maintain a minimum touch bounding box of `40px x 40px` on mobile screens.
3. **High Accessibility Contrast**: All body text achieves a minimum contrast ratio of `4.5:1` against `--surface-canvas` and `--surface-raised`. Primary headings achieve `7:1+`.
