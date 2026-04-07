# World Press Radar Domain Setup

This runbook covers the production domain setup for:

- `app.worldpressradar.com` -> Vercel web app
- `api.worldpressradar.com` -> `api-news` on the Mac mini

This is the recommended production path because the customer portal and the authenticated article API are deployed as separate production services, even though the browser now talks to the portal first.

## Target architecture

- customer portal: `https://app.worldpressradar.com`
- authenticated API: `https://api.worldpressradar.com`
- registrar and DNS: Cloudflare
- customer web hosting: Vercel
- API origin: Mac mini via Cloudflare Tunnel

## Part 1. Connect `app.worldpressradar.com` to Vercel

Use this for the customer web app.

### Vercel dashboard steps

1. Open Vercel and select the World Press Radar web project.
2. Open `Settings`.
3. Open `Domains`.
4. Click `Add`.
5. Enter `app.worldpressradar.com`.
6. Save.
7. Vercel will show the DNS record it expects for this subdomain.

For a subdomain, Vercel expects a `CNAME` record. Official docs:

- [Use an existing domain](https://vercel.com/docs/getting-started-with-vercel/use-existing)
- [Setting up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain)

### Cloudflare DNS steps

1. Open Cloudflare.
2. Select the `worldpressradar.com` zone.
3. Open `DNS` -> `Records`.
4. Click `Add record`.
5. Type: `CNAME`
6. Name: `app`
7. Target: use exactly the hostname Vercel shows in the project domain settings.
8. Proxy status: `DNS only`
9. Save.

Why `DNS only` for the Vercel app:

- Vercel recommends avoiding Cloudflare as a reverse proxy in front of Vercel because it can reduce traffic visibility, add latency, and create cache issues.
- Reference: [Should I use Cloudflare in front of Vercel?](https://vercel.com/guides/cloudflare-with-vercel)

### Verify the app domain

1. Return to Vercel `Settings` -> `Domains`.
2. Wait until `app.worldpressradar.com` shows as configured and SSL is issued.
3. Test:

```bash
curl -I https://app.worldpressradar.com
```

4. If needed, redeploy after adding production env vars.

## Part 2. Connect `api.worldpressradar.com` to the Mac mini

The cleanest way to expose the local API without opening inbound ports is Cloudflare Tunnel.

Official docs:

- [Cloudflare Tunnel overview](https://developers.cloudflare.com/tunnel/)
- [Set up Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/setup/)

### Preconditions

- `api-news` is already running on the Mac mini
- local API health succeeds:

```bash
curl http://127.0.0.1:4100/health
```

- Cloudflare DNS is authoritative for `worldpressradar.com`

### Install `cloudflared`

On the Mac mini:

```bash
brew install cloudflared
```

### Authenticate `cloudflared`

```bash
cloudflared tunnel login
```

This opens a browser window. Choose the `worldpressradar.com` zone and authorize it.

### Create the tunnel

```bash
cloudflared tunnel create worldpressradar-api
```

Cloudflare will output a tunnel ID and create credentials under `~/.cloudflared/`.

### Create the tunnel config

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<user>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: api.worldpressradar.com
    service: http://127.0.0.1:4100
  - service: http_status:404
```

### Publish the hostname

You can do this either in the dashboard or in the terminal.

Terminal:

```bash
cloudflared tunnel route dns worldpressradar-api api.worldpressradar.com
```

Dashboard path:

1. Cloudflare
2. `Networking`
3. `Tunnels`
4. Select your tunnel
5. `Add route`
6. `Published application`
7. Hostname: `api.worldpressradar.com`
8. Service URL: `http://127.0.0.1:4100`

Cloudflare's published-application route flow is documented here:

- [Publish an application route](https://developers.cloudflare.com/tunnel/setup/)

### Run the tunnel

Foreground test:

```bash
cloudflared tunnel run worldpressradar-api
```

Verify:

```bash
curl https://api.worldpressradar.com/health
```

### Install the tunnel as a service

After the foreground test works:

```bash
sudo cloudflared service install
sudo launchctl load -w /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
```

Then confirm the tunnel restarts after reboot.

## Part 3. Point the web app at the API

In Vercel project settings:

1. Open `Settings`
2. Open `Environment Variables`
3. Add:

```bash
NEXT_PUBLIC_NEWS_API_BASE_URL=https://api.worldpressradar.com
WPR_INTERNAL_API_BASE_URL=https://portal-api.worldpressradar.com
```

4. Apply to `Production`
5. Redeploy production

Use `WPR_INTERNAL_API_BASE_URL` only for the server-side portal proxy. Browser traffic should stay on
`https://api.worldpressradar.com`.

## Part 4. API production env checklist

On the API host:

```bash
DATABASE_URL=postgres://...
NEWS_API_HOST=0.0.0.0
NEWS_API_PORT=4100
NEWS_API_ALLOW_PUBLIC_READ_ONLY=0
NEWS_API_CORS_ORIGINS=https://app.worldpressradar.com
NEWS_API_TOKEN=<internal-admin-token>
NEWS_API_TOKEN_POLICIES=<customer-token-policy-json>
```

Important:

- keep `NEWS_API_ALLOW_PUBLIC_READ_ONLY=0`
- do not share `NEWS_API_TOKEN`
- only issue customer tokens from `NEWS_API_TOKEN_POLICIES`

## Part 5. End-to-end smoke test

Anonymous API access must fail:

```bash
curl -i https://api.worldpressradar.com/api/news
```

Expected: `401`

Customer token must work:

```bash
curl -i \
  -H "Authorization: Bearer <customer-token>" \
  "https://api.worldpressradar.com/api/dashboard/summary"
```

Expected: `200`

Portal flow:

1. Open `https://app.worldpressradar.com`
2. Without a token, verify that no article data loads
3. Enter a valid customer token
4. Verify `Dashboard` loads counts
5. Verify `Benchmark` and `Map` load customer views

## Alternate API hosting option

If you do not want to run the API on the Mac mini:

- move `api-news` to a VM or managed host
- point `api.worldpressradar.com` to that host instead
- keep the same env contract and token model

The only thing that changes is the origin behind `api.worldpressradar.com`.
