import {
  createOpencode,
  createOpencodeClient,
  type OpencodeClient,
  type Event,
  type AssistantMessage,
  type Part,
} from "@opencode-ai/sdk";
import { config } from "../config.js";

let client: OpencodeClient | null = null;
let serverClose: (() => void) | null = null;

async function tryConnectExisting(port: number): Promise<OpencodeClient | null> {
  const url = `http://127.0.0.1:${port}`;
  try {
    const testClient = createOpencodeClient({ baseUrl: url });
    await testClient.path.get();
    console.log(`[opencode] 기존 서버에 연결됨: ${url}`);
    return testClient;
  } catch {
    return null;
  }
}

export async function getClient(): Promise<OpencodeClient> {
  if (client) return client;

  const existing = await tryConnectExisting(config.opencode.port);
  if (existing) {
    client = existing;
    return client;
  }

  console.log("[opencode] 기존 서버 없음, 새 서버 시작 중...");
  const result = await createOpencode({
    port: config.opencode.port,
  });

  client = result.client;
  serverClose = result.server.close;

  console.log(`[opencode] 서버 시작됨: ${result.server.url}`);
  return client;
}

export interface PromptResult {
  text: string;
  sessionId: string;
  cost: number;
  tokens: { input: number; output: number };
}

export async function sendPrompt(
  message: string,
  directory: string,
  sessionId?: string,
): Promise<PromptResult> {
  const sdk = await getClient();

  // 1) 세션 생성 또는 기존 세션 사용
  let activeSessionId = sessionId;
  if (!activeSessionId) {
    const { data: session } = await sdk.session.create({
      body: { title: message.slice(0, 50) },
      query: { directory },
    });
    if (!session) throw new Error("세션 생성 실패");
    activeSessionId = session.id;
  }

  // 2) SSE 이벤트 스트림 구독
  const sseResult = await sdk.event.subscribe({
    query: { directory },
  });

  // 3) 비동기 프롬프트 전송 (즉시 반환)
  await sdk.session.promptAsync({
    path: { id: activeSessionId },
    body: {
      parts: [{ type: "text", text: message }],
    },
    query: { directory },
  });

  // 4) SSE 스트림에서 이벤트를 소비하며 permission 자동 승인 + 완료 대기
  let lastAssistantMessage: AssistantMessage | null = null;

  try {
    for await (const event of sseResult.stream) {
      const ev = event as Event;

      // permission 요청 → 자동 승인
      if (ev.type === "permission.updated") {
        const perm = ev.properties;
        if (perm.sessionID === activeSessionId) {
          console.log(`[opencode] permission 자동 승인: ${perm.title} (${perm.id})`);
          await sdk.postSessionIdPermissionsPermissionId({
            path: { id: activeSessionId, permissionID: perm.id },
            body: { response: "once" },
            query: { directory },
          });
        }
      }

      // assistant 메시지 업데이트 추적
      if (ev.type === "message.updated") {
        const msg = ev.properties.info;
        if (msg.role === "assistant" && msg.sessionID === activeSessionId) {
          lastAssistantMessage = msg;
        }
      }

      // 세션이 idle 상태 = 처리 완료
      if (ev.type === "session.idle") {
        if (ev.properties.sessionID === activeSessionId) {
          break;
        }
      }

      // 세션 에러 감지
      if (ev.type === "session.error") {
        if (ev.properties.sessionID === activeSessionId && ev.properties.error) {
          const errObj = ev.properties.error;
          const errMsg = "data" in errObj && errObj.data && typeof errObj.data === "object" && "message" in errObj.data
            ? String(errObj.data.message)
            : errObj.name;
          throw new Error(`OpenCode 세션 에러: ${errMsg}`);
        }
      }
    }
  } catch (err) {
    // SSE 스트림 에러가 아닌 경우 재throw
    if (err instanceof Error && err.message.startsWith("OpenCode 세션 에러")) {
      throw err;
    }
    // SSE 연결 끊김 등은 무시하고 결과 조회 시도
    console.warn("[opencode] SSE 스트림 종료:", err);
  }

  // 5) 세션 메시지 조회로 최종 결과 수집
  const { data: messages } = await sdk.session.messages({
    path: { id: activeSessionId },
    query: { directory },
  });

  if (!messages || messages.length === 0) {
    throw new Error("프롬프트 실행 실패: 메시지 없음");
  }

  // 마지막 assistant 메시지 찾기
  const lastEntry = [...messages].reverse().find(
    (m) => m.info.role === "assistant",
  );

  if (!lastEntry) {
    throw new Error("프롬프트 실행 실패: assistant 응답 없음");
  }

  const assistantMsg = lastEntry.info as AssistantMessage;
  const parts: Part[] = lastEntry.parts;

  const textParts = parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");

  return {
    text: textParts || "(응답 없음)",
    sessionId: activeSessionId,
    cost: assistantMsg.cost,
    tokens: {
      input: assistantMsg.tokens.input,
      output: assistantMsg.tokens.output,
    },
  };
}

export function shutdown(): void {
  if (serverClose) {
    serverClose();
    console.log("[opencode] 서버 종료");
  }
}
