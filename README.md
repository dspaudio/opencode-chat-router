# OpenCode Chat Router - 개발 히스토리

이 문서는 OpenCode Chat Router 프로젝트의 전체 대화 히스토리를 세션별로 정리한 것입니다.

---

## 목차

1. [세션 1: Google Chat 연동 아이디어 + 프로젝트 생성](#세션-1-google-chat-연동-아이디어--프로젝트-생성)
2. [세션 2: 텔레그램 인증 보안 취약점 점검](#세션-2-텔레그램-인증-보안-취약점-점검)
3. [세션 3: 맥 잠자기 방지 설정](#세션-3-맥-잠자기-방지-설정)
4. [세션 4: Agent is ready for input 메시지](#세션-4-agent-is-ready-for-input-메시지)
5. [세션 5: 텔레그램 parse_mode 미적용 문제](#세션-5-텔레그램-parse_mode-미적용-문제)
6. [세션 6: MarkdownV2 예약 문자 이스케이프 오류 수정](#세션-6-markdownv2-예약-문자-이스케이프-오류-수정)

---

## 세션 1: Google Chat 연동 아이디어 + 프로젝트 생성

> 세션 ID: `ses_3248ba071ffexqMmjJZhwN2VQ0`
> 경로: `~`

이 프로젝트의 시작점. Google Chat으로 OpenCode에 연결하는 아이디어에서 시작해 텔레그램 봇 추가, 보안 설정, permission 자동 처리까지 한 세션에서 모두 진행됨.

### 대화 1: Google Chat 연동 가능성 질문

**사용자:**
> google chat으로 opencode에 연결해서 결과를 받아볼 수 있어? 주요한 세 개의 프로젝트가 각각 다른 디렉토리에 있는데, 이 프로젝트의 전환까지도 수행하는 방식이었으면 좋겠어.

**OpenCode 응답:**
가능하다는 결론과 함께 아키텍처를 제안:

- `opencode serve` — 헤드리스 REST API 서버 (포트 4096)
- `@opencode-ai/sdk` (Node.js) — 서버 실행 + 클라이언트 통합 SDK
- `--dir <path>` — 프로젝트 디렉토리 동적 전환
- `--session <id>` — 세션 유지 (대화 맥락 이어가기)

아키텍처 다이어그램:
```
┌─────────────┐     HTTP POST      ┌──────────────────────┐
│ Google Chat  │ ──────────────────▶│  Cloud Run (Handler) │
│  (사용자)    │ ◀─────────────────│  - Express/Fastify   │
└─────────────┘   message.patch     │  - Google Chat API   │
                  (점진적 업데이트)   └──────────┬───────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │  opencode serve      │
                                    │  (헤드리스 서버)       │
                                    │  /project-a  ←─┐     │
                                    │  /project-b  ←─┤ dir │
                                    │  /project-c  ←─┘     │
                                    └──────────────────────┘
```

구현 스택: Cloud Run + Node.js + @opencode-ai/sdk + Firestore + Google Workspace Service Account

---

### 대화 2: 프로젝트 생성 요청

**사용자:**
> ~/workspace/opencode-chat-router 경로에 만들어줘 google 계정은 (이메일) 로 연결하면 되고, oAuth 인증은 .env에 토큰을 저장하는 방식이면 좋을 것 같아.

**OpenCode 응답:**
프로젝트 scaffolding 완료. 생성된 구조:

```
opencode-chat-router/
├── src/
│   ├── index.ts              # Express 서버 (포트 8080)
│   ├── config.ts             # .env 파싱, 프로젝트 매핑
│   ├── chat/
│   │   ├── auth.ts           # Google OAuth + Chat API
│   │   └── handler.ts        # Webhook 핸들러 (슬래시 커맨드 + OpenCode 연동)
│   ├── opencode/
│   │   └── client.ts         # OpenCode SDK 래퍼
│   └── store/
│       └── state.ts          # 사용자별 활성 프로젝트/세션 인메모리 관리
├── .env.example
├── Dockerfile
├── SETUP.md                  # GCP 설정 가이드
├── package.json
└── tsconfig.json
```

---

### 대화 3: 텔레그램 추가 + 전체 프로젝트 등록

**사용자:**
> 로컬에서 실행할거라 도커는 필요없을 것 같고, 프로젝트는 ~/workspace 에 있는 프로젝트를 모두 등록해줘. 그리고 텔레그램으로 연결할 수 있을까?

**OpenCode 응답:**
변경 사항:
- **Dockerfile 삭제**
- `.env.example` — `~/workspace` 내 16개 프로젝트 전부 등록 + `TELEGRAM_BOT_TOKEN` 추가
- `config.ts` — Google Chat은 선택적(토큰 없으면 비활성), 텔레그램 설정 추가
- `src/telegram/bot.ts` 추가 — Telegraf 기반 텔레그램 봇 (long polling, ngrok 불필요)
- `SETUP.md` — 텔레그램 설정 안내 추가

---

### 대화 4: OPENCODE_SERVER_PASSWORD 설정

**사용자:**
> OPENCODE_SERVER_PASSWORD가 설정되지 않았다고 하는데, 어떻게 설정해?

**OpenCode 응답:**
에러가 아니라 경고(Warning). 로컬에서만 쓴다면 설정할 필요 없음. 비밀번호 설정 시 HTTP Basic Auth가 활성화되며, SDK 클라이언트에도 인증 헤더를 전달해야 하므로 로컬 전용이면 비워두는 것을 권장.

---

### 대화 5: 텔레그램 봇 오류 (포트 충돌)

**사용자:**
> 텔레그램 봇으로 연결했을 때에는 오류가 발생했어.

**OpenCode 응답:**
원인: 이미 실행 중인 opencode(TUI 또는 다른 세션)가 포트 4096을 점유 → SDK가 새 서버 시작 시 포트 충돌.

수정: `getClient()`가 먼저 기존 서버 연결을 시도하고, 없을 때만 새 서버를 시작하도록 변경.

---

### 대화 6: Telegraf 타임아웃 (90초)

**사용자:**
> 텔레그램으로 /switch laravel 을 한 뒤 .env 내용이 어떻게돼? 라고 물었는데 opencode에서는 처리가 끝난 것 같은데, 텔레그램 봇에서는 laravel에서 처리 중... 으로 나오고 답이 없네. TimeoutError: Promise timed out after 90000 milliseconds

**OpenCode 응답:**
Telegraf의 핸들러 타임아웃(기본 90초) 문제. 수정:
1. `handlerTimeout: Infinity` — 기본 90초 핸들러 타임아웃 제거
2. fire-and-forget 패턴 — `bot.on("text")` 핸들러가 `processPrompt()`를 `await` 없이 호출하고 즉시 반환

---

### 대화 7: 보안 - 사용자 화이트리스트

**사용자:**
> 보안적으로는 문제가 없어? 나 혼자만 쓰고 싶은데

**OpenCode 응답:**
문제 있음. 텔레그램 봇 username을 아는 누구나 메시지를 보내면 프로젝트에서 OpenCode가 실행됨. 파일 읽기/쓰기, 셸 명령까지 가능.

해결: `TELEGRAM_ALLOWED_USER_IDS` 환경변수 + 인증 미들웨어 추가. `/myid` 커맨드로 본인 ID 확인 후 `.env`에 등록.

---

### 대화 8: .env 파일에 사용자 ID 설정

**사용자:**
> .env 파일도 수정해줘.

**OpenCode 응답:**
`.env`에 `TELEGRAM_ALLOWED_USER_IDS=(사용자 ID)` 설정 완료. 봇 토큰이 대화에 노출됐으니 BotFather에서 `/revoke`로 재발급 권장.

---

### 대화 9: Permission 자동 처리 구현

**사용자:**
> session has question 처리가 없는것 같아.

**OpenCode 응답:**
맞음. OpenCode가 파일 수정이나 셸 실행 시 permission 요청을 보내는데, 기존 코드에서 이를 처리하지 않아 작업이 멈춤.

수정:
- `session.prompt()` (동기, permission 시 hang) → `session.promptAsync()` + `event.subscribe()` SSE 패턴
- SSE 스트림에서 `permission.updated` 이벤트 감지 → `response: "always"` 자동 승인
- `session.idle` → 처리 완료, 루프 탈출
- `session.error` → 에러 throw

---

### 대화 10: oh-my-opencode 플러그인 동작 여부

**사용자:**
> 이 프로젝트에서 oh-my-opencode 와 같은 플러그인이 동작하는거야?

**OpenCode 응답:**
아니요. 이 앱은 OpenCode의 HTTP API(SDK)를 통해 직접 통신하므로 TUI 레이어 플러그인은 동작하지 않음.

| 기능 | 동작 여부 | 이유 |
|------|----------|------|
| AGENTS.md / 프로젝트 설정 | O | 서버가 directory 기준으로 로드 |
| 모델 선택 / provider | O | 서버 설정 기반 |
| oh-my-opencode 훅/프롬프트 | X | TUI 플러그인, SDK 경유 시 미적용 |
| 커스텀 슬래시 커맨드 | X | TUI 레이어 전용 |

---

### 대화 11: MD 파일 실행 가능 여부

**사용자:**
> 커스텀 슬래시 커맨드를 호출 못해도 특정 경로에 있는 md 파일을 실행할 수는 있는거지?

**OpenCode 응답:**
맞음. md 파일 내용을 읽어서 `parts: [{ type: "text", text: mdContent }]`로 전달하면 OpenCode 서버는 그냥 긴 텍스트 프롬프트를 받은 것과 동일하게 처리. 다만 "자동으로 읽어서 실행"하는 기능은 현재 없고, 직접 내용을 복붙하거나 `/run <command-name>` 커맨드를 추가해야 함.

**사용자:**
> 따로 구현하지 않아도 동작할까?

**OpenCode 응답:**
md 파일 내용을 직접 타이핑/복붙하는 것만으로 충분하면 현재 상태 그대로 동작. "특정 경로의 md 파일을 자동으로 읽어서 실행"하는 건 별도 구현 필요.

---

## 세션 2: 텔레그램 인증 보안 취약점 점검

> 세션 ID: `ses_32440d980ffeskwT4zu8CXtfuV`
> 경로: `~/workspace/opencode-chat-router`

### 대화 1: 보안 감사 요청

**사용자:**
> 이 프로젝트의 서비스에 접속하려면 현재 텔레그램만 설정되어 있는데, 보안 구멍이 있는지 찾아봐줘

**OpenCode 응답:**
전체 코드 분석 후 보안 감사 결과 제시:

**Critical (즉시 조치 필요):**
1. 텔레그램 봇 토큰이 .env에 평문 노출 (이미 대화에서 노출됨)
2. Google Chat webhook `/chat`에 인증이 전혀 없음 (verification token 미사용)
3. OpenCode permission 자동 승인이 `"always"` — 가장 위험. 모든 권한을 영구 승인
4. OpenCode 서버 패스워드 미설정

**High:**
5. Rate limiting 없음
6. 서버 파일시스템 경로 전체 노출 (프로젝트 목록 응답에 절대 경로)
7. `/health` 엔드포인트 인증 없이 내부 정보 노출

**Medium:**
8. 에러 메시지에 내부 정보 유출
9. `TELEGRAM_ALLOWED_USER_IDS` 미설정 시 완전 개방 (경고만 출력, fail-fast 아님)
10. Input validation 전무
11. CORS/보안 헤더 없음
12. config.ts에 개인 이메일 하드코딩

공격 시나리오:
```
공격자가 서버 URL을 알면 (/chat 엔드포인트)
→ 인증 없이 POST 가능
→ OpenCode에 임의 프롬프트 전송
→ permission 자동 승인으로 파일시스템 무제한 접근
→ 서버 장악
```

---

### 대화 2: Permission 자동 승인 수준 변경

**사용자:**
> 3번 자동 승인만 approve로 변경해줘. 그리고 구글챗 설정을 안할 생각이라 문제는 없을 것 같아.

**OpenCode 응답:**
SDK에서 `"approve"`는 지원하지 않음. 허용 값: `"once" | "always" | "reject"`. `"always"` → `"once"`(세션당 1회 승인)로 변경.

---

## 세션 3: 맥 잠자기 방지 설정

> 세션 ID: `ses_3243a5d00ffeZ7lqoILfss7sYy`
> 경로: `~/workspace/opencode-chat-router`

### 대화 1: 서버 실행 중 잠자기 방지

**사용자:**
> npm run dev로 실행해서 서버가 동작중일 때 맥이 잠자기 하지 않도록 설정할 수 있을까? 물론 서버를 종료하면 잠자기가 가능해야해.

**OpenCode 응답:**
macOS 내장 `caffeinate` 명령어로 해결. `package.json`의 `dev` 스크립트를 수정:

```json
"dev": "caffeinate -dimsu tsx watch src/index.ts"
```

자식 프로세스(`tsx watch`)가 살아있는 동안 잠자기 방지. 종료되면 자동 해제.

| 플래그 | 효과 |
|--------|------|
| `-d` | 디스플레이 꺼짐 방지 |
| `-i` | 시스템 idle sleep 방지 |
| `-m` | 디스크 잠자기 방지 |
| `-s` | 전원 어댑터 없어도 sleep 방지 |
| `-u` | 사용자가 active 상태인 것처럼 동작 |

---

### 대화 2: 디스플레이 꺼짐 방지 제거

**사용자:**
> 디스플레이 꺼짐 방지는 불필요해

**OpenCode 응답:**
`-d` 플래그 제거. `"dev": "caffeinate -imsu tsx watch src/index.ts"`

---

## 세션 4: Agent is ready for input 메시지

> 세션 ID: `ses_3243741a3ffegCL2i2Na6dNbCU`
> 경로: `~/workspace/opencode-chat-router`

### 대화 1: 메시지 의미 확인

**사용자:**
> Agent is ready for input이 나오는데?

**OpenCode 응답:**
이 프로젝트 코드에는 없는 메시지. `@opencode-ai/sdk`의 `createOpencode()`가 내부적으로 opencode 서버를 띄울 때 출력하는 정상적인 상태 메시지.

**사용자:**
> 텔레그램 답변이 아니라 서버쪽 애플 스크립트에 그렇게 나와.

**OpenCode 응답:**
`createOpencode()`가 내부적으로 opencode 서버 프로세스를 띄울 때 그 프로세스의 stdout이 콘솔에 같이 찍히는 것. **정상 동작**이며, 서버가 기동되었다는 의미. 이후 Telegram 메시지가 정상 동작하면 무시해도 됨.

---

## 세션 5: 텔레그램 parse_mode 미적용 문제

> 세션 ID: `ses_32422b6f8ffe5HCzYIYrjRgVqj`
> 경로: `~/workspace/opencode-chat-router`

### 대화 1: Markdown 렌더링 안됨

**사용자:**
> OpenCode의 응답 본문을 텔레그램으로 응답할 때 텔레그램의 chat API에서 markdown을 지원한다고 하는데, parse_mode가 적용이 안된거 같아.

**OpenCode 응답:**
원인 분석:
```typescript
const escapedResponse = escapeMarkdownV2(result.text);
```
OpenCode 응답 전체를 `escapeMarkdownV2()`로 처리하여 마크다운 포맷팅 기호까지 전부 이스케이프됨. `**bold**` → `\*\*bold\*\*`로 변환되어 평문으로 렌더링.

해결 방향 3가지 제시:
| 방법 | 장점 | 단점 |
|---|---|---|
| Markdown → HTML 변환 후 `parse_mode: "HTML"` | 가장 안정적 | HTML 태그가 Telegram 지원 범위에 맞아야 함 |
| 일반 Markdown → MarkdownV2 변환기 구현 | Telegram 네이티브 마크다운 | 매우 복잡 |
| `parse_mode` 없이 평문 전송 | 가장 단순 | 포맷팅 완전히 사라짐 |

추천: Markdown → HTML 변환 후 `parse_mode: "HTML"`

---

### 대화 2: HTML 변환 구현

**사용자:**
> 추천하는 방식으로 처리해줘

**OpenCode 응답:**
`marked` 라이브러리 설치 후 구현:

**새 파일: `src/telegram/markdown.ts`**
- `marked` 라이브러리의 커스텀 렌더러로 Markdown → Telegram HTML 변환
- Telegram 지원 태그만 사용: `<b>`, `<i>`, `<s>`, `<a>`, `<code>`, `<pre>`, `<blockquote>`
- 미지원 요소 fallback: heading → `<b>`, list → `•` 텍스트, table → `<pre>` 정렬, image → `<a>` 링크, hr → `———`

**변경: `src/telegram/bot.ts`**
- `escapeMarkdownV2(result.text)` → `markdownToTelegramHtml(result.text)`
- `parse_mode` → `"HTML"`
- 봇 명령어(`/start`, `/help` 등)는 기존 MarkdownV2 유지 (정적 텍스트)

---

### 대화 3: GitHub 저장소 생성

**사용자:**
> 이 프로젝트를 내 github에 private repository로 업로드하고 싶어. .env 등 보안에 민감한 부분은 .gitignore 처리를 해야해. github에 아직 이 프로젝트의 repository 설정이 되어 있지 않기 때문에 private repository를 새로 생성해야해

**OpenCode 응답:**
Private repository 생성 완료: **https://github.com/(GitHub username)/opencode-chat-router**
- `.env`는 `.gitignore`에 의해 제외 (토큰, 비밀번호 미포함)
- `dist/`, `node_modules/`도 제외

---

### 대화 4: .env.example 정리

**사용자:**
> .env.example 에 실제 이메일 주소와 로컬 경로는 정리해줘.

**OpenCode 응답:**
이메일은 빈 값으로, 프로젝트 경로는 `my-project:/path/to/project` 형태의 placeholder로 교체 후 push 완료.

---

## 세션 6: MarkdownV2 예약 문자 이스케이프 오류 수정

> 경로: `~/workspace/opencode-chat-router`

### 대화 1: TelegramError 400 — MarkdownV2 파싱 실패

**사용자:**
> `/help` 또는 `/start` 명령 실행 시 Telegram API에서 400 에러 발생:
> `Bad Request: can't parse entities: Character '>' is reserved and must be escaped with the preceding '\'`

**OpenCode 응답:**
원인 분석:
- `/start`와 `/help` 핸들러에서 `/switch <별칭>` 텍스트가 `parse_mode: "MarkdownV2"`로 전송되는데, `<`와 `>`가 MarkdownV2 예약 문자임에도 이스케이프되지 않았음
- 추가로 `escapeMarkdownV2()` 함수의 정규식에 `>`만 포함되어 있고 `<`가 누락되어 있어, 동적 데이터에서도 `<` 문자가 이스케이프되지 않는 잠재적 문제 존재

수정 내용:
1. `/start` 핸들러: `/switch <별칭>` → `/switch \<별칭\>` 이스케이프 처리
2. `/help` 핸들러: 동일하게 이스케이프 처리
3. `escapeMarkdownV2()` 정규식: `>` → `<>` 로 확장하여 `<` 문자도 이스케이프 대상에 포함

변경 파일: `src/telegram/bot.ts`

---

## 전체 타임라인 요약

| 순서 | 내용 | 결과 |
|------|------|------|
| 1 | Google Chat + OpenCode 연동 가능성 질문 | 아키텍처 설계 |
| 2 | 프로젝트 생성 (Express + Google Chat) | scaffolding 완료 |
| 3 | 텔레그램 추가 + 전체 프로젝트 등록 | Telegraf 봇 추가, Dockerfile 제거 |
| 4 | OPENCODE_SERVER_PASSWORD 설정 | 로컬 전용이면 불필요 |
| 5 | 포트 충돌 오류 수정 | 기존 서버 연결 우선 시도 |
| 6 | Telegraf 90초 타임아웃 | handlerTimeout: Infinity + fire-and-forget |
| 7 | 보안: 사용자 화이트리스트 | TELEGRAM_ALLOWED_USER_IDS 추가 |
| 8 | .env에 사용자 ID 설정 | 사용자 ID 등록 |
| 9 | Permission 자동 처리 | promptAsync + SSE + 자동 승인 구현 |
| 10 | oh-my-opencode 플러그인 동작 여부 | TUI 플러그인은 미동작 |
| 11 | MD 파일 실행 가능 여부 | 복붙은 가능, 자동 로드는 별도 구현 필요 |
| 12 | 보안 감사 | Critical 4건, High 3건, Medium 5건 발견 |
| 13 | Permission 승인 수준 변경 | "always" → "once" |
| 14 | 맥 잠자기 방지 | caffeinate 래핑 |
| 15 | Agent is ready for input | 정상 메시지, 무시 가능 |
| 16 | 텔레그램 Markdown 렌더링 | marked + HTML parse_mode 전환 |
| 17 | GitHub private repo 생성 | (GitHub username)/opencode-chat-router |
| 18 | .env.example 정리 | 개인정보 placeholder로 교체 |
| 19 | MarkdownV2 예약 문자 이스케이프 오류 | `<>` 이스케이프 + escapeMarkdownV2 함수 보완 |
