# WPM /api/news 외부 연동 가이드 (Render 기준 최신판)

이 문서는 동료 서비스에서 `news_articles` 조회 API를 사용하는 방법을 정리한 가이드입니다.

⚠️ 운영 버전 기준:
- `/health`, `/api/news`는 실제 호출 가능.
- `/api/filters`, `/docs`, `/openapi.json`, `/playground`는 배포 상태를 확인 후 사용하세요.

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
DATABASE_URL=<현재 운영 PostgreSQL 연결 문자열>
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
- `created_from`, `created_to` (created_at 범위 증분 동기화용)
- `updated_from`, `updated_to` (updated_at 범위 증분 동기화용)

> alias도 지원됩니다:  
> `min_createdAt` / `min_created_at`, `max_createdAt` / `max_created_at`  
> `min_updatedAt` / `min_updated_at`, `max_updatedAt` / `max_updated_at`

필터 파라미터
- `country` (복수 가능: `United States,Japan`)
- `source` (복수 가능)
- `section` (복수 가능)
- `language` (복수 가능)

### 증분 수집 추천 패턴 (중복/누락 방지)
동료가 매 시간 기준 점진 동기화를 할 때, **마지막으로 수집한 시각(예: updatedAt)**를 저장해두고 이후 구간만 조회하세요.

1회 기준 호출(초기):
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://world-press-monitor.onrender.com/api/news?hours=24&country=United%20States&limit=100"
```

다음 호출(증분):
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "https://world-press-monitor.onrender.com/api/news?updated_from=2026-02-21T12:00:00.000Z&country=United%20States&limit=100"
```

권장 동작:
- 새 데이터만 안전하게 받으려면 `created_from` 사용.
- 수정된 기사가 반영되도록 하려면 `updated_from` 사용(권장).
- 클라이언트에서 `id` 또는 `url` 기준으로 2차 dedupe 적용.

### created 기준 증분 수집이 기본 동작이라는 점 (권장)

우리가 지금 운영 중인 수집 특성상, 일단은 `created_from/created_to`를 기본 증분 기준으로 쓰는 걸 권장합니다.

- 기본 규칙:
  - 매 호출마다 마지막 수집 시각을 `created_from`에 넣고(`YYYY-MM-DDTHH:mm:ss.sssZ`),
  - `created_to`는 호출 시각(`Tnow`)으로 둡니다.
  - 예: 01:00~02:00 구간은 `created_from=2026-02-21T01:00:00Z&created_to=2026-02-21T02:00:00Z`
- 왜 `updated_from`이 보조인지:
  - `updated_from`은 RSS 데이터 자체가 늦게 바뀌는 경우(메타데이터 갱신/재배포) 보강용입니다.
  - 초기 설계는 “새로 들어온 것”(created) 기준, 보강은 선택적(updated)로 보세요.

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

### 배포 가이드 (팀 전달용)
- `/api/filters`, `/docs`, `/openapi.json`, `/playground`는 배포 후 확인 가능한 상태입니다.

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
