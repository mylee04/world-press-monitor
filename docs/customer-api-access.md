# World Press Radar API Access

This document is meant to be shared with customers who have been issued an API token.

## What you received

You should have received:

- a portal URL
- an API base URL
- a read-only API token

Production targets:

- Portal: `https://app.worldpressradar.com`
- API: `https://api.worldpressradar.com`

## What your token allows

Customer API tokens are read-only.

A valid token can be used to:

- unlock the customer portal
- read dashboard summary data
- query filtered article results
- read filter metadata

A valid token does not allow:

- data writes
- admin actions
- token creation
- customer management

## Authentication

Send your token in the `Authorization` header:

```http
Authorization: Bearer <your-token>
```

If you omit the token or send an invalid token, the API returns `401 Unauthorized`.

## Recommended starting points

### 1. Portal access

1. Open `https://app.worldpressradar.com`
2. Go to `Access`
3. Paste your token
4. Open `Dashboard`, `Benchmark`, or `Map`

### 2. API health check

```bash
curl -i \
  -H "Authorization: Bearer <your-token>" \
  "https://api.worldpressradar.com/health"
```

### 3. Dashboard summary

```bash
curl -i \
  -H "Authorization: Bearer <your-token>" \
  "https://api.worldpressradar.com/api/dashboard/summary"
```

### 4. Filtered article query

```bash
curl -i \
  -H "Authorization: Bearer <your-token>" \
  "https://api.worldpressradar.com/api/news?section=world&country=United%20States&limit=50"
```

### 5. Filter metadata

```bash
curl -i \
  -H "Authorization: Bearer <your-token>" \
  "https://api.worldpressradar.com/api/filters"
```

## Query guidance

Use the API as a filtered read service, not as a full-database dump.

Recommended:

- filter by `section`, `country`, date range, or source when possible
- page through results with `limit` and `offset`
- keep `limit` reasonable
- cache what you already fetched on your side

Common query parameters:

- `limit`
- `offset`
- `hours`
- `publication_from`
- `publication_to`
- `created_from`
- `created_to`
- `updated_from`
- `updated_to`
- `country`
- `source`
- `section`
- `language`

## Security rules

- treat your token like a password
- do not embed it in public frontend code
- do not commit it to GitHub
- do not share it outside your organization
- rotate it immediately if it is exposed

If a token is leaked, World Press Radar may revoke it and issue a replacement.

## Error handling

- `401 Unauthorized`
  - token missing, expired, revoked, or malformed
- `429` or reduced throughput
  - your account may have reached a policy limit
- `5xx`
  - temporary service issue, retry with backoff

## Support request template

When contacting support, include:

- your company name
- the endpoint you called
- timestamp with timezone
- response status code
- a redacted sample request

Do not send the full token in support emails or chat messages.

## Copy-paste customer email

Use the block below when sending access to a customer.

```txt
Subject: World Press Radar portal and API access

Hello,

Your World Press Radar access is now ready.

Portal URL:
https://app.worldpressradar.com

API Base URL:
https://api.worldpressradar.com

API Token:
<paste customer token here>

Authentication:
Send the token in the Authorization header as:
Authorization: Bearer <your-token>

Quick test:
curl -H "Authorization: Bearer <your-token>" \
  "https://api.worldpressradar.com/api/dashboard/summary"

Security rules:
- Treat this token like a password.
- Do not share it outside your organization.
- Do not place it in public frontend code or public repositories.

If you need rotation or run into access issues, reply with the endpoint, timestamp, and status code, but do not send the full token in email.
```
