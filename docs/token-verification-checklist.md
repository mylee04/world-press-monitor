# Token Verification Checklist

Use this checklist when a customer says their World Press Radar token stopped working.

## 1. Identify the token type first

There are two different token classes in this system:

- customer token: stored on the API host in `NEWS_API_TOKEN_POLICIES`
- internal/admin token: stored as `NEWS_API_TOKEN` or `NEWS_API_TOKENS` on the API host

Do not diagnose a customer issue with the internal token unless you are explicitly checking portal or operator connectivity.

## 2. Confirm where the runtime is reading tokens from

Run:

```bash
bash scripts/check-news-api-token.sh
```

Expected result:

- it prints the env files loaded by `scripts/load-local-env.sh`
- it prints masked internal token inventory
- it prints masked customer policy inventory

Current local runtime order is:

1. `.env.local`
2. `.env.macmini.local`
3. `.env.example` only as fallback

## 3. Check whether a specific customer token exists in policy storage

Use the exact token from a secure channel and compare it locally:

```bash
bash scripts/check-news-api-token.sh --token '<customer-token>'
```

Expected result:

- `FOUND kind=customer`: token exists in `NEWS_API_TOKEN_POLICIES`
- `NOT FOUND`: token is not present in the currently loaded local API policy set

If the user cannot share the full token, ask for a secure channel. First/last 4 characters are useful for conversation, but exact matching still requires the full token.

## 4. Revalidate the internal/admin token separately

This checks the operator token path, not the customer path.

Local API host:

```bash
source scripts/load-local-env.sh
load_local_env

curl -i \
  -H "Authorization: Bearer ${NEWS_API_TOKEN}" \
  "http://127.0.0.1:${NEWS_API_PORT:-4100}/api/news?limit=1"
```

Public API host:

```bash
source scripts/load-local-env.sh
load_local_env

curl -i \
  -H "Authorization: Bearer ${NEWS_API_TOKEN}" \
  "https://api.worldpressradar.com/api/news?limit=1"
```

Interpretation:

- local `200`, public `401`: public API deployment/runtime is out of sync with local token
- local `401`, public `401`: internal token itself is invalid or API runtime policy is broken
- local `200`, public `200`: internal token path is healthy

## 5. Revalidate the customer token separately

Direct API checks:

```bash
curl -i \
  -H "Authorization: Bearer <customer-token>" \
  "https://api.worldpressradar.com/health"
```

```bash
curl -i \
  -H "Authorization: Bearer <customer-token>" \
  "https://api.worldpressradar.com/api/dashboard/summary"
```

Portal-session check:

```bash
curl -i \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"token":"<customer-token>"}' \
  "https://app.worldpressradar.com/api/customer-access"
```

Interpretation:

- API `401` and portal `401`: customer token is rejected upstream
- API `200` and portal `401/5xx`: portal proxy or portal env issue
- API `200` and portal `200`: token is valid and the user issue is likely client-side or transient

## 6. If the token exists but still fails

Check these in order:

1. wrong environment loaded on the API host
2. stale deployment or process not restarted after token rotation
3. token copied with whitespace or `Bearer` prefix twice
4. policy JSON malformed and partially ignored
5. public API host pointing at a runtime that does not have the latest env

## 7. Immediate operator summary template

```txt
I checked token storage and validation paths separately.

- Customer tokens are stored in NEWS_API_TOKEN_POLICIES on the API host.
- Internal operator tokens are stored in NEWS_API_TOKEN / NEWS_API_TOKENS.
- Portal session cookies do not act as the source of truth for token issuance.

Result:
- Customer token policy match: <FOUND or NOT FOUND>
- Internal token check: <200 or 401>
- Public customer API check: <200 or 401>
- Portal access check: <200 or 401>

Conclusion:
<one-line diagnosis>
```
