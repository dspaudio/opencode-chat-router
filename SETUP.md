# OpenCode Chat Router 설정 가이드

## 1. 환경변수 설정

```bash
cp .env.example .env
```

Google Chat과 Telegram 중 하나만 설정해도 동작합니다. 둘 다 설정하면 양쪽에서 모두 사용 가능합니다.

---

## 2. Telegram 설정 (권장 — 가장 간단)

### 2-1. Bot 생성
1. Telegram에서 [@BotFather](https://t.me/BotFather)에게 DM
2. `/newbot` 입력
3. 봇 이름과 username 설정
4. 발급받은 **토큰**을 `.env`의 `TELEGRAM_BOT_TOKEN`에 입력

### 2-2. 실행
```bash
NODE_ENV=development npm run dev
```

### 2-3. 사용
Telegram에서 생성한 봇에게 DM을 보내면 바로 사용 가능합니다. ngrok 등 터널링이 필요 없습니다 (long polling 방식).

---

## 3. Google Chat 설정 (선택)

### 3-1. API 활성화
[GCP Console](https://console.cloud.google.com/) 에서:
- **Google Chat API** 활성화
- **Google Workspace APIs** 활성화

### 3-2. OAuth 2.0 클라이언트 생성
1. GCP Console → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized redirect URIs: `https://developers.google.com/oauthplayground`
5. Client ID와 Client Secret을 `.env`에 입력

### 3-3. Refresh Token 발급
1. [OAuth Playground](https://developers.google.com/oauthplayground/) 접속
2. 우측 상단 ⚙️ → **Use your own OAuth credentials** 체크
3. Client ID, Client Secret 입력
4. 좌측에서 scope 입력:
   ```
   https://www.googleapis.com/auth/chat.messages
   https://www.googleapis.com/auth/chat.messages.create
   ```
5. **Authorize APIs** → user@example.com 로 로그인
6. **Exchange authorization code for tokens**
7. Refresh Token을 `.env`의 `GOOGLE_REFRESH_TOKEN`에 입력

### 3-4. Chat App 등록
1. GCP Console → **Google Chat API** → **Configuration**
2. 설정:
   - **App name**: OpenCode Router
   - **Description**: OpenCode AI 코딩 에이전트 브릿지
   - **Functionality**: Receive 1:1 messages
   - **Connection settings**: **HTTP endpoint URL**
   - **HTTP endpoint URL**: `https://your-domain.com/chat` (ngrok 등으로 터널링)
   - **Visibility**: 특정 사용자 (user@example.com)

### 3-5. 로컬 개발 시 (ngrok 필요)
```bash
# 터미널 1: 서버 실행
NODE_ENV=development npm run dev

# 터미널 2: ngrok 터널
ngrok http 8080
```

---

## 4. 사용법 (Telegram / Google Chat 공통)

| 명령어 | 설명 |
|---|---|
| `/projects` | 등록된 프로젝트 목록 (16개) |
| `/switch <별칭>` | 프로젝트 전환 (예: `/switch nuxt`) |
| `/status` | 현재 활성 프로젝트 및 세션 정보 |
| `/reset` | 현재 프로젝트 세션 초기화 |
| `/help` | 도움말 |
| (일반 텍스트) | 현재 프로젝트의 OpenCode에 전달 |

## 5. 아키텍처

```
                     ┌─ Telegram Bot (long polling) ─┐
                     │                                │
사용자 메시지 ───────┤                                ├──→ OpenCode SDK
                     │                                │     ├── session.create(directory)
                     └─ Google Chat (webhook POST) ──┘     └── session.prompt(parts)
                                                                  │
                                                                  ▼
                                                           프로젝트 디렉토리
                                                           (~/workspace/*)
```
