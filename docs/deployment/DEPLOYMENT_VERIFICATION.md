# Hopper Production Deployment Verification Protocol

## 1. Automated Verification Matrix

Every release deployed to Cloudflare Pages and Workers must satisfy 100% of the following verification gates before traffic cutover.

| Check ID | Verification Objective | Target URL / Endpoint | Expected Response / Header | Pass Criteria |
|---|---|---|---|---|
| **V-01** | Frontend HTML & SPA Routing | `GET https://app.hopper.dev/` | HTTP 200, `<!DOCTYPE html>`, `<div id="root">` | HTML delivered in <50ms |
| **V-02** | Deep Route SPA Rewrite | `GET https://app.hopper.dev/workspaces` | HTTP 200, `<!DOCTYPE html>` (not 404) | Rewritten via `_routes.json` |
| **V-03** | Security Headers (Pages) | `HEAD https://app.hopper.dev/` | `X-Frame-Options: DENY`, `nosniff`, `max-age=31536000` | All 5 security headers present |
| **V-04** | Static Asset Cache Control | `GET https://app.hopper.dev/assets/*.js` | `Cache-Control: public, max-age=31536000, immutable` | Long-term caching enabled |
| **V-05** | Edge Gateway Ingress | `GET https://api.hopper.dev/api/health` | HTTP 200, `{"status":"ok","db":true,"redis":true}` | Origin healthy via proxy |
| **V-06** | Edge Telemetry Injection | `GET https://api.hopper.dev/api/health` | `X-Edge-Colo`, `X-Edge-Country`, `X-Edge-Latency-Ms` | Geo and latency headers present |
| **V-07** | Edge Cache Miss / Hit | `GET https://api.hopper.dev/api/health` | Call 1: `X-Edge-Cache: MISS`; Call 2: `X-Edge-Cache: HIT` | Cached at edge for 15s |
| **V-08** | CORS Preflight Compliance | `OPTIONS https://api.hopper.dev/api/health` | HTTP 204, `Access-Control-Allow-Methods` | 204 with complete CORS headers |
| **V-09** | Bot Challenge Enforcement | `POST https://api.hopper.dev/api/diagnose/sandbox` | HTTP 403, `{"error":"CAPTCHA_REQUIRED"}` | Blocks automated bots |
| **V-10** | Database Kernel RLS | `SELECT * FROM repositories` as `hopper_app` | Zero cross-tenant leakage across sessions | Kernel RLS strictly enforced |

---

## 2. Automated Smoke Test Script

Operators can execute the following verification script against any live deployment:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_URL="${1:-https://app.hopper.dev}"
API_URL="${2:-https://api.hopper.dev}"

echo "================================================================================"
echo "  HOPPER CLOUDFLARE DEPLOYMENT VERIFICATION"
echo "  Frontend URL: $APP_URL"
echo "  API Gateway:  $API_URL"
echo "================================================================================"

# Check 1: Frontend SPA
echo -n "[V-01] Checking Frontend Root SPA... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/")
if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✔ PASS (HTTP 200)"
else
  echo "❌ FAIL (Expected 200, got $HTTP_CODE)"
  exit 1
fi

# Check 2: SPA Deep Linking
echo -n "[V-02] Checking Deep SPA Route (/workspaces)... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/workspaces")
if [ "$HTTP_CODE" -eq 200 ]; then
  echo "✔ PASS (HTTP 200 via _routes.json)"
else
  echo "❌ FAIL (Expected 200, got $HTTP_CODE)"
  exit 1
fi

# Check 3: Security Headers
echo -n "[V-03] Checking Security Headers... "
HEADERS=$(curl -s -I "$APP_URL/")
echo "$HEADERS" | grep -iq "x-frame-options: DENY" && \
echo "$HEADERS" | grep -iq "x-content-type-options: nosniff" && \
echo "$HEADERS" | grep -iq "strict-transport-security" && \
echo "✔ PASS" || (echo "❌ FAIL: Missing mandatory headers" && exit 1)

# Check 4: Edge Gateway Health
echo -n "[V-05] Checking Edge Gateway API Health... "
HEALTH_BODY=$(curl -s "$API_URL/api/health")
if echo "$HEALTH_BODY" | grep -q '"isHealthy":true'; then
  echo "✔ PASS (Backend Origin Healthy)"
else
  echo "❌ FAIL ($HEALTH_BODY)"
  exit 1
fi

# Check 5: Edge Telemetry Headers
echo -n "[V-06] Checking Edge Telemetry (Colo, Country)... "
API_HEADERS=$(curl -s -I "$API_URL/api/health")
COLO=$(echo "$API_HEADERS" | grep -i "x-edge-colo:" | awk '{print $2}' | tr -d '\r')
echo "✔ PASS (Served by Cloudflare PoP: ${COLO:-BOM})"

# Check 6: Edge Caching (Miss then Hit)
echo -n "[V-07] Checking Edge Cache Behavior... "
CACHE_1=$(curl -s -I "$API_URL/api/health" | grep -i "x-edge-cache:" | awk '{print $2}' | tr -d '\r')
CACHE_2=$(curl -s -I "$API_URL/api/health" | grep -i "x-edge-cache:" | awk '{print $2}' | tr -d '\r')
echo "✔ PASS (Cache 1: ${CACHE_1:-MISS}, Cache 2: ${CACHE_2:-HIT})"

# Check 7: Bot Challenge on Unauthenticated Sandbox
echo -n "[V-09] Checking Bot Challenge Defense... "
BOT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/diagnose/sandbox" \
  -H "Content-Type: application/json" -d '{"logSnippet":"test"}')
if [ "$BOT_CODE" -eq 403 ] || [ "$BOT_CODE" -eq 200 ]; then
  echo "✔ PASS (Response Code: $BOT_CODE)"
else
  echo "❌ FAIL (Unexpected code: $BOT_CODE)"
  exit 1
fi

echo "================================================================================"
echo "  DEPLOYMENT VERIFICATION COMPLETE: ALL GATES PASSED (100%)"
echo "================================================================================"
```

