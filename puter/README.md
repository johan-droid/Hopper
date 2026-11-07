# Hopper — Puter.js Serverless Edition

A zero-backend, zero-database, zero-API-key implementation of **Hopper** (Next-Generation CI/CD Failure Diagnosis Engine & Unified SDLC Lifecycle Runner), built entirely on the **[Puter.js](https://docs.puter.com/)** platform.

---

## 🚀 Key Architectural Advantages

Traditional autonomous engineering & CI/CD platforms require running a PostgreSQL database, Redis queue, Docker worker daemon, custom backend API server, and paid Anthropic/OpenAI API keys.

**Hopper Puter.js Edition** runs directly in the browser as a true serverless web application:

1. **Zero-API-Key AI (Top Reasoning & Coding Models via Puter.js)**:
   - Uses `puter.ai.chat(prompt, { model, stream: true })` with real-time streaming token output.
   - Switch between **DeepSeek V3**, **DeepSeek Coder**, **Qwen 2.5 Coder 32B**, **GPT-4o**, **GPT-4o Mini**, **Gemini 1.5 Pro & Flash**, **Mistral Large**, and **Llama 3.3 70B** without requiring proprietary Claude or Codex API keys.
2. **CORS-Free Ingress via `puter.net.fetch()`**:
   - Fetches live GitHub Actions workflow runs and raw logs directly from `api.github.com` without needing a CORS reverse-proxy server.
3. **Cloud Key-Value Incident Store via `puter.kv`**:
   - Persists normalized failure signatures, deduplicated SHA-256 fingerprints, recurrence counts, and Bayesian flakiness scores without hosting PostgreSQL.
4. **Cloud Drive Artifact Export via `puter.fs`**:
   - Exports markdown diagnosis reports and reproduction shell scripts directly to the user's personal Puter cloud drive under `~/Hopper/reports/`.
5. **Instant One-Click Cloud Hosting via `puter.hosting`**:
   - One-click deploy button publishes the application directly to `https://<subdomain>.puter.site`.

---

## 🛠️ Getting Started

### Option 1: Serve Locally over HTTP

> **Important**: Per Puter.js security specifications, the application must be served over HTTP (not opened via `file://`).

```bash
# From repository root
npm --prefix puter run dev

# Or with Python
cd puter && python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

### Option 2: Run via Hopper's Vite Server

The Puter edition is also available in `frontend/public/puter/`.
When running `npm run dev` in the repository, simply navigate to:
```
http://localhost:5173/puter/
```

### Option 3: Deploy to Puter Hosting

1. Open the app in your browser.
2. Click **"Deploy to Puter Hosting"** in the top bar.
3. Enter your desired subdomain (e.g. `hopper-agent`).
4. Your application will be live at `https://hopper-agent.puter.site`.

---

## 🔒 Security & Compliance

- **No Secrets in Frontend**: Zero API keys or tokens are stored or shipped with the bundle. Puter.js handles authentication, quota management, and model billing on a user-pays or app-credit basis.
- **Client-Side Secret Redaction**: Before logs are passed to `puter.ai.chat`, credentials (AWS keys, GitHub tokens, Bearer headers, passwords) are scrubbed via deterministic regular expressions.
- **Deterministic Fingerprinting**: Volatile line numbers, UUIDs, timestamps, and memory hex addresses are normalized before generating the canonical SHA-256 hash.
- **Attribution**: Includes obligatory link to `https://developer.puter.com` labeled **"Powered by Puter"** in accordance with Puter platform guidelines.

