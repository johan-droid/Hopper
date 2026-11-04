# Hopper Frontend (Option B: Decoupled Architecture)

Production-grade web dashboard for the **Hopper CI/CD Failure Diagnosis & Cloud Moat Engine**.

## ⚡ Tech Stack

- **Framework:** [React 18/19](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) (DevOps dark-mode terminal palette)
- **Data Fetching & Cache:** [TanStack Query v5](https://tanstack.com/query)
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Boundary Validation:** [Zod](https://zod.dev/)

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js `v20+` or `v24+`
- Hopper Express API running on port `3000` (or configured via `VITE_API_BASE_URL`)

### 2. Local Setup
```bash
cd frontend
npm install
npm run dev
```

The frontend will run at `http://localhost:5173` and automatically proxy all `/api/*` network requests to `http://localhost:3000`.

### 3. Build & Typecheck
```bash
# Typecheck
npm run lint

# Production build
npm run build
```
Static artifacts will be emitted to `frontend/dist/`.

---

## 🌐 Production Deployment

### Deploying to Vercel
1. Set **Root Directory** to `frontend`.
2. Framework Preset will auto-detect as **Vite**.
3. Set Environment Variable:
   - `VITE_API_BASE_URL`: `https://api.hopper.dev`
4. Deploy! SPA routing rewrites are configured in `vercel.json`.

### Deploying to Cloudflare Pages
1. Build command: `npm run build`
2. Build output directory: `dist`
3. Set Environment Variable:
   - `VITE_API_BASE_URL`: `https://api.hopper.dev`
4. Deploy! The SPA rewrite rule is configured in `public/_redirects`.

---

## 🔒 CORS Configuration on Backend

In production, ensure the backend (`src/server/index.ts`) has the frontend domain whitelisted:
```bash
CORS_ALLOWED_ORIGINS=https://app.hopper.dev,https://hopper.dev
FRONTEND_URL=https://app.hopper.dev
```
