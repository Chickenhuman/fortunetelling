# fortunetelling
사주풀이/운세 서비스 초기 구현체입니다.

## 현재 구현 상태
- 프론트엔드: 단일 페이지 UI에서 실제 API 호출로 전환
- 입력: 이름, 성별, 생년월일, 양력/음력, 출생시간 + `모름` 버튼
- 분석 탭: 종합/일일/월간/연간
- 분석 UX: 일시적 실패 시 자동 재시도 + 수동 재시도 버튼 제공
- 백엔드: `/api/analyze` 단일 엔드포인트
- AI 제공자: `OpenAI` 우선, `mock` 제공자 포함(멀티모델 확장 구조)
- 사주 엔진: `@fullstackfamily/manseryeok` 기반(지원 입력 연도: `1900~2050`)
- 개인정보 정책: 서버 코드에서 요청 원문 저장/로그 금지

## 실행 방법
1. Node.js 20+ 환경 준비
2. `.env.example`를 참고해 환경변수 설정
3. 서버 실행

```bash
npm start
```

4. 브라우저 접속

```text
http://localhost:3000
```

## 테스트 실행
```bash
npm test
```

## 환경변수
- `PORT`: 기본 `3000`
- `DATA_DIR`: 사용자 데이터 저장 경로(기본 `./data`)
- `AI_PROVIDER`: `openai` 또는 `mock`
- `AUTH_TOKEN_SECRET`: 인증 토큰 서명 키
- `OPENAI_API_KEY`: OpenAI 사용 시 필수
- `OPENAI_MODEL`: 기본 `gpt-4.1-mini`

## API 스펙(초안)
### `POST /api/analyze`
요청:

```json
{
  "profile": {
    "name": "홍길동",
    "gender": "male",
    "birthDate": "1990-01-01",
    "calendarType": "solar",
    "birthTimeUnknown": true,
    "birthTime": ""
  },
  "type": "overall"
}
```

### `POST /api/auth/signup`
요청:

```json
{
  "email": "user@example.com",
  "password": "password1234",
  "displayName": "홍길동"
}
```

응답:

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "홍길동",
      "createdAt": "2026-03-05T00:00:00.000Z",
      "updatedAt": "2026-03-05T00:00:00.000Z"
    },
    "accessToken": "jwt",
    "tokenType": "Bearer",
    "expiresInSec": 604800
  }
}
```

### `POST /api/auth/login`
요청:

```json
{
  "email": "user@example.com",
  "password": "password1234"
}
```

### `GET /api/auth/me`
헤더:

```text
Authorization: Bearer <accessToken>
```

응답:

```json
{
  "ok": true,
  "data": {
    "meta": {
      "provider": "mock",
      "type": "overall"
    },
    "pillars": {
      "year": {"stem": "己", "stemColor": "#A1887F", "branch": "巳", "branchColor": "#D84315"},
      "month": {"stem": "乙", "stemColor": "#2E7D32", "branch": "卯", "branchColor": "#2E7D32"},
      "day": {"stem": "壬", "stemColor": "#1565C0", "branch": "辰", "branchColor": "#A1887F"},
      "hour": null
    },
    "report": {
      "title": "AI 종합 사주풀이",
      "headline": "...",
      "summary": "...",
      "sections": [{"heading": "...", "body": "..."}],
      "cautions": ["..."],
      "actionTips": ["..."],
      "lucky": {"color": "...", "number": "...", "direction": "..."}
    }
  }
}
```

오류 응답(표준):

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "지원 범위는 1900년부터 2050년까지입니다.",
    "retryable": false
  }
}
```

## 폴더 구조
```text
.
├── index
├── server.js
└── src
    ├── auth-service.js
    ├── errors.js
    ├── fortune-service.js
    ├── prompt.js
    ├── saju-engine.js
    ├── validation.js
    └── providers
        ├── index.js
        ├── mock-provider.js
        └── openai-provider.js
```

## 단계별 개발 계획서
### 1단계: MVP 안정화 (현재~1주)
- 입력 검증 강화(윤달/음력 상세 옵션)
- API 실패 재시도/사용자 메시지 고도화
- 관측성(에러율, 응답시간) 지표 추가

### 2단계: 정확도 고도화 (2~3주)
- 임시 `saju-engine` 제거
- 실제 사주 계산 엔진(절기/대운/세운) 적용
- 기준 데이터셋으로 계산 정확도 테스트

### 3단계: 해설 품질 고도화 (3~4주)
- 프롬프트 버전 관리
- 출력 형식 안정화(JSON 스키마 + 정책 필터)
- 전문가 감수 기반 품질 피드백 루프

### 4단계: 서비스 운영 준비 (4~6주)
- 비밀키 관리/레이트 리밋
- 무저장 정책 문서화(개인정보 처리방침)
- 배포 자동화 및 장애 대응 절차

## 아직 미정인 항목(추가 결정 필요)
- 월간 활성 사용자 수/요청량(비용 및 캐시 전략 결정에 필요)
- 웹 우선 출시 후 앱 전환 시점(릴리즈 일정/인력 계획에 영향)

## 참고
- `src/saju-engine.js`는 `@fullstackfamily/manseryeok`를 사용합니다.
- 음력 입력은 양력 변환 후 계산하며, 윤달 입력은 현재 UI에서 미지원입니다.
