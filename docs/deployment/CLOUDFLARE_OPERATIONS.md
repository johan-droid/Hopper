# Hopper Cloudflare Edge Operations & Incident Response Manual

## 1. Day-2 Operations & Observability

### Real-Time Edge Logging
Cloudflare Workers provides sub-second live streaming log tails without installing logging agents:

```bash
# Stream live HTTP requests, status codes, and console logs from edge isolates
npx wrangler tail --name hopper-edge --format=pretty

# Filter by status code (e.g. observe origin errors)
npx wrangler tail --name hopper-edge --status=error
```

### Metrics & Analytics Dashboards
Monitor the following metrics in Cloudflare Dashboard under **Workers & Pages > hopper-edge > Metrics**:
- **Request Count:** Track 24-hour aggregate against the 100,000 requests/day free allowance.
- **Median CPU Time:** Ensure CPU execution remains <1.5ms (well under the 10ms free-tier limit).
- **Subrequest Duration:** Monitor origin latency trends (indicates database or BullMQ worker load).
- **Error Rates (5xx):** Alert if 5xx errors exceed 0.5% of total traffic.

---

## 2. Edge Cache Management

### Instant Edge Cache Purge
When deploying updates to public data or fixing erroneous cached status endpoints:

```bash
# Purge everything in Cloudflare Edge Cache
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"purge_everything":true}'

# Purge specific URL (e.g. health or stats)
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"files":["https://api.hopper.dev/api/health", "https://api.hopper.dev/api/signatures/stats"]}'
```

### Operator Cache Bypass
To inspect live origin responses without cache interference:
```bash
curl -H "Cache-Control: no-cache" https://api.hopper.dev/api/health
```

---

## 3. Incident Response Playbooks

### Incident 1: Edge Gateway Returns HTTP 504 Gateway Timeout
- **Symptom:** Clients receive `{"error":"ORIGIN_GATEWAY_TIMEOUT"}` with `X-Edge-Colo` header.
- **Root Cause:** Origin server is unreachable, Node.js process crashed, or firewall dropped Cloudflare edge IPs.
- **Recovery Procedure:**
  1. SSH into the origin server:
     ```bash
     pm2 status
     # If hopper-api is stopped or erroring:
     pm2 logs hopper-api --lines 50
     pm2 restart hopper-api
     ```
  2. Verify local health directly on origin:
     ```bash
     curl -s http://localhost:3000/api/health
     ```
  3. Verify origin firewall permits Cloudflare IP ranges:
     ```bash
     sudo ufw status
     ```

### Incident 2: Daily Worker Request Limit Exhaustion (HTTP 1015)
- **Symptom:** Cloudflare returns `Error 1015: You are being rate limited` or daily quota exceeded.
- **Root Cause:** Traffic exceeded 100,000 requests in a 24-hour UTC window.
- **Emergency Mitigation (Zero Downtime):**
  1. **Option A (Instant DNS Bypass):** Change DNS for `api.hopper.dev` in Cloudflare DNS settings from Proxied (Orange Cloud) to DNS-only (Grey Cloud). Traffic routes directly to origin Nginx/PM2 without hitting Worker limits.
  2. **Option B (Plan Upgrade):** Click **Upgrade Plan** on Workers in Cloudflare Dashboard to Workers Paid ($5.00/month), immediately unlocking 10,000,000 requests/month and higher CPU limits.

### Incident 3: DDoS Attack or Elevated Bot Scraping
- **Symptom:** Unusually high request rate on diagnostic sandbox or authentication routes.
- **Recovery Procedure:**
  1. Open Cloudflare Dashboard > **Security** > **Settings**.
  2. Toggle **Under Attack Mode** to `ON` (presents Cloudflare Managed Challenge to all suspicious traffic before reaching Worker or origin).
  3. Under **Security > WAF > Custom Rules**, create a Rate Limiting Rule:
     - Match: `URI Path eq "/api/diagnose/sandbox"`
     - Rate: `> 10 requests per minute per IP`
     - Action: `Block for 1 hour` or `Managed Challenge`.

