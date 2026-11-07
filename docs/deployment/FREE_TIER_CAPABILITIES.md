# Hopper: Free-Tier Capabilities & Cost Governance

*Verification Date: 2026-11-07*  
*Role: Vercel Deployment & AI Systems Engineer*

---

## 1. Free-Tier Resource Inventory

| Service | Plan / Tier | Verified Capabilities & Quotas | Boundaries & Constraints |
|---|---|---|---|
| **Vercel** | Hobby (Free) | • Free edge/web hosting<br>• Node.js Serverless Functions (up to 60s max execution)<br>• 1024 MB function RAM<br>• Custom domains & automatic TLS | • Non-commercial personal evaluation use only<br>• Vercel Queues are non-standard on Hobby; PostgreSQL outbox acts as the durable queue |
| **Supabase** | Free Tier | • 500 MB PostgreSQL database<br>• 50,000 Monthly Active Users (Auth)<br>• Row Level Security (RLS)<br>• 5 GB egress/month | • Projects pause after 7 days of inactivity (can be unpaused via dashboard)<br>• Connection limits managed via connection pooling |
| **GitHub** | Free Developer | • Unlimited public repo GitHub Actions<br>• 2,000 private repo Actions minutes/month<br>• GitHub OAuth & GitHub Apps (zero cost)<br>• Webhook ingress | • Rate limit: 5,000 requests/hour for authenticated API tokens |
| **Puter.js** | Free Developer Tier | • Free user-pays allowance across 977 catalog models (DeepSeek V3, Qwen 2.5 Coder, GPT-4o Mini, Gemini 1.5 Flash)<br>• Free cloud hosting (`*.puter.site`)<br>• Puter KV & Drive storage | • Background webhook jobs cannot access a user's browser Puter session unless a service token is provided |
| **React Bits** | Open-Source | • Free UI components and animations (MIT License) | • No Pro registry, paid agent kits, or license-key dependencies |

---

## 2. Cost Control Guarantees

1. **Zero Paid Dependencies**: Direct Anthropic/OpenAI API keys are completely optional and disabled by default.
2. **Zero Involuntary Billing**: Stripe checkout in development returns demo tiers; no automatic credit card charging or plan upgrade is forced on developers.
3. **Fail-Closed Budgeting**: In `backend/src/lib/billing/quota-guard.ts` and `ai-budget-controller.ts`, admission caps and nominal reservations strictly prevent unbounded spend.

---

## 3. Deployment Pre-Flight Checklist

Before deploying Hopper live to Vercel and Supabase:

- [ ] Create a GitHub OAuth App with:
  - Homepage URL: `https://<your-vercel-domain>.vercel.app`
  - Authorization callback URL: `https://<your-vercel-domain>.vercel.app/login/callback`
- [ ] In Vercel Project Settings, configure:
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`
  - `JWT_SECRET` (at least 32 characters)
  - `DATABASE_URL` (Supabase connection pooler URL: transaction mode, port 6543)
  - `GITHUB_APP_WEBHOOK_SECRET`
  - `GITHUB_APP_ID`
  - `GITHUB_APP_PRIVATE_KEY`
- [ ] In Supabase SQL Editor:
  - Run `backend/supabase/migrations/0001_initial_schema.sql` through `0010_durable_queue_and_coordination.sql`.

