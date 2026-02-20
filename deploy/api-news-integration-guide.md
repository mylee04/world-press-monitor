# WPM /api/news 외부 연동 가이드 (Render 기준 최신판)

이 문서는 현재 운영 중인 Render 배포 기준으로 동료 서비스에서 `news_articles` 조회 API를 사용하는 방법을 정리한 가이드입니다.

⚠️ **중요**: `/api/filters`, `/docs`, `/openapi.json`, `/playground` 라우트는 지금은 로컬 코드에만 반영된 상태입니다.  
**아직 Render에 배포되지 않아 현재는 실제로 호출되지 않습니다.**  
팀 공유용 문서로 남겨두고, 배포 후 바로 사용하세요.

## 1) 서비스 개요

- 서비스 주소: `https://world-press-monitor.onrender.com` (예시)
- 제공 엔드포인트
  - `GET /health`
  - `GET /api/news`
  - `GET /api/filters` (선택: 필터 목록 조회)
  - `GET /docs` (Swagger UI)
  - `GET /openapi.json`
  - `GET /playground` (토큰 테스트 UI)

## 2) 인증

- API는 `Authorization` 헤더 기반 토큰 인증을 사용합니다.
- 포맷: `Bearer <NEWS_API_TOKEN>`
- `NEWS_API_TOKEN`은 Render 환경변수로 등록하고, 팀/외부 협업용으로 별도 키를 분리해서 발급하세요.

요청 예시:
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://world-press-monitor.onrender.com/health"

curl -H "Authorization: Bearer <TOKEN>" \
  "https://world-press-monitor.onrender.com/api/news?hours=24&limit=20&country=United%20States,Japan"
```

## 3) 운영 환경(현재 적용 중)

### Render Web Service 설정
- Build Command: `bun install`
- Start Command:
  - `bash scripts/run-api-news.sh` (권장)
- 실행 스크립트에서 동적으로 `PORT`를 바인딩:
  - `bash -lc 'export NEWS_API_PORT="$PORT"; bun run api:news:serve'` 형태 사용
- 권장 환경 변수
```bash
NEWS_API_HOST=0.0.0.0
NEWS_API_TOKEN=<공유한 토큰>
NEWS_API_CORS_ORIGINS=*
DATABASE_URL=<Neon 또는 PostgreSQL 연결 문자열>
NODE_ENV=production
```
- Render는 `$PORT`를 주입합니다. 따라서 별도 고정 포트가 아닌 `NEWS_API_PORT="$PORT"` 방식이 안정적입니다.

### Render 운영 주의
- Free 플랜은 inactivity 시 스핀다운이 발생해 첫 요청이 지연될 수 있습니다.
- 무료 플랜은 cron/one-off 실행 정책이 제한적일 수 있으므로, 중요한 장기 작업은 별도 방식으로 관리하세요.
- 배포 후 `curl`로 최소 1회 헬스체크 후 API 호출을 확인하세요.

## 4) /api/news 파라미터

공통 파라미터
- `limit` (1~200, 기본 100)
- `offset` (정수)
- `hours` (1~720, 기본 48)
- `from`, `to` (ISO datetime, 기존 호환용)
- `publication_from`, `publication_to` (publication_datetime 기준)

필터 파라미터
- `country` (복수 가능: `United States,Japan`)
- `source` (복수 가능)
- `section` (복수 가능)
- `language` (복수 가능)

응답 핵심
- `total`: 전체 매칭 건수
- `items`: 현재 페이지 결과
- `params`: 실제 적용 파라미터
- `generatedAt`: 최근 조회 생성 시각

최소 예시:
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://world-press-monitor.onrender.com/api/news?limit=50&hours=24&country=United%20States&language=en&section=world"
```

## 5) /api/filters (선택)

`/playground` UI에서 필터 항목을 동적으로 로딩하기 위한 값 집합을 제공합니다.
필수 기능은 아니며, 필요하면 제거 가능합니다.

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://world-press-monitor.onrender.com/api/filters"
```

## 6) 동료가 바로 붙이는 가이드

- API URL: `https://world-press-monitor.onrender.com/api/news`
- 인증: `Authorization: Bearer <개인 키>`
- 기본 테스트:
  - `limit=10`
  - `hours=24`
  - `country`, `language`, `source`, `section` 중 하나 이상 조합
- 실시간 문서 확인:
  - `https://world-press-monitor.onrender.com/docs`
  - `https://world-press-monitor.onrender.com/openapi.json`

## 7) 보안/운영 체크리스트

- 토큰은 팀별/서비스별로 분리
- 로그에서 토큰이 노출되지 않도록 주의
- 필요 시 IP 화이트리스트 또는 사내 프록시 경유 정책 적용
- 요청량/응답 크기 폭증 방지를 위해 `limit` 기본값을 유지

## 8) DB 용량은 직접 확인

운영 환경에서 최신 DB 크기를 확인하려면 배포 환경 DB에서 직접 조회하세요:
```sql
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS db_size;
```

테이블별 확인:
```sql
SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass)) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass) DESC;
```

## 9) 배포 전/후 팀 공유 체크리스트

### 배포 전 (현재)
- 실제 사용 가능: `GET /health`, `GET /api/news`
- 아직 미사용: `/api/filters`, `/docs`, `/openapi.json`, `/playground`

### 배포 전 안내 문구 (팀 전달용)
- `/api/filters`, `/docs`, `/openapi.json`, `/playground`는 현재 배포되지 않아 미호출 상태입니다. 배포 후 아래 항목이 열리면 사용 가능합니다.

### 배포 후 꼭 확인할 항목
- 헬스체크:
  ```bash
  curl -H "Authorization: Bearer <TOKEN>" \
    "https://world-press-monitor.onrender.com/health"
  ```
- 라우트 확인:
  - `https://world-press-monitor.onrender.com/api/news?limit=1`
  - `https://world-press-monitor.onrender.com/openapi.json`
  - `https://world-press-monitor.onrender.com/docs`
  - `https://world-press-monitor.onrender.com/playground`
  - `https://world-press-monitor.onrender.com/api/filters`
- 팀 공지 공유 항목:
  - API Base URL
  - 토큰 발급 방식(팀별/서비스별)
  - 사용 파라미터 정리 (`country`, `source`, `section`, `language`, `hours`, `limit`, `offset`, `publication_from`, `publication_to`)
