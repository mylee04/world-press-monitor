# WPM /api/news 외부 연동 배포 가이드

## 1) 어디에 배포할까?

현재 `api-news`는 HTTP API 서버라서, 다음 두 조건만 맞으면 동료 서비스에서 바로 호출 가능해요.

- `NEWS_API_HOST=0.0.0.0`로 바인딩
- 포트(기본 4100) 접근 가능

권장 배포 대상:

- VPS (우선 추천): Hetzner Cloud, DigitalOcean, Linode, Lightsail, Vultr 등
  - 장점: 안정적, 비용 예측이 쉬움, 장기 운영에 유리
  - 단점: 월 구독료가 있음
- Docker/PaaS: Railway, Render, Fly.io, Dokku, Fly Machines
  - 장점: 배포가 빠르고 초보자 친화적
  - 단점: Cold start/트래픽 제한을 정책 확인 필요
- 임시 테스트용: 기존에 열려 있는 서버(예: nginx/proxy) 뒤에 같은 내부망 노출

중요:
- 이 프로젝트의 DB는 `news_articles` 직접 조회를 기준으로 동작하므로,
  API 서버와 DB는 같은 네트워크에서 접근 가능해야 합니다.

## 2) 공짜인지? (가격)

- 로컬 PC에서 돌릴 때: 인프라 비용은 0원(PC 전원/인터넷/전력 제외)
- 클라우드 VPS: 보통 월 과금(보통 소형 인스턴스부터 시작, 저렴한 플랜 존재)
- PaaS: 기본 크레딧/Free tier가 있지만 “무료”는 기간/제한이 있음(시간, 대역폭, sleep, 크레딧 소진 등)

권장: 외부 팀 호출이 필수라면 로컬이 아니라 최소 1개 인스턴스(클라우드 또는 사내 서버)에 상주 배포.

## 3) 현재 로컬 DB 크기 기준 (확인값)

- DB(`wpm`) 전체: **43 MB**
- 테이블 Top 크기
  - `news_articles`: **32 MB**
  - `rss_health_status`: **1.35 MB**
  - `ingest_ops_hourly`: **712 kB**
  - `ingest_ops_daily`: **416 kB**
  - `ingest_feed_watermarks`: **272 kB**

해당 값은 현재 시점 기준 `DATABASE_URL=.../wpm`에서 직접 조회한 결과입니다.

## 4) 배포용 실행 포인트

환경변수 예시:

```bash
NEWS_API_HOST=0.0.0.0
NEWS_API_PORT=4100
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/wpm
NEWS_API_TOKEN=<동료에게 공유할 토큰>
NODE_ENV=production
```

실행:

```bash
bun run api:news:serve
```

점검:
- `curl http://<host>:4100/health`
- `curl -H "Authorization: Bearer <TOKEN>" "http://<host>:4100/api/news?limit=1&hours=24"`

## 5) systemd 서비스 템플릿 (참고)

```ini
[Unit]
Description=WPM API News Service
After=network.target

[Service]
Type=simple
User=myuser
WorkingDirectory=/path/to/world-press-monitor
Environment=NODE_ENV=production
Environment=NEWS_API_HOST=0.0.0.0
Environment=NEWS_API_PORT=4100
Environment=DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/wpm
Environment=NEWS_API_TOKEN=changeme
ExecStart=/usr/bin/env bash -lc 'cd /path/to/world-press-monitor && bun run api:news:serve'
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

주의:
- `myuser`, `WorkingDirectory`, `Database URL`, `NEWS_API_TOKEN`는 실제 값으로 바꿔야 합니다.
- 토큰은 환경변수 파일로 관리하고, git에는 커밋하지 마세요.

## 6) 동료 연동용 API 호출 예시

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://api.your-domain.com/api/news?limit=50&hours=24&country=United%20States,Japan"
```

파라미터:
- `hours` (1~720), `from`, `to` (ISO8601), `country`, `source`, `section`, `limit`, `offset`

권장:
- 동료는 공통 계정보다 전용 클라이언트 키를 받아서 호출하고, IP 제한 또는 WAF를 함께 적용하세요.
