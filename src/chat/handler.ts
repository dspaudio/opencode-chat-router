import type { Request, Response } from "express";
import { config, findProject } from "../config.js";
import { sendPrompt, type PromptResult } from "../opencode/client.js";
import { sendMessage, updateMessage } from "./auth.js";
import {
  getOrCreateState,
  setActiveProject,
  getSessionId,
  setSessionId,
} from "../store/state.js";

const MAX_CHAT_LENGTH = 4096;

interface ChatEvent {
  type: "MESSAGE" | "ADDED_TO_SPACE" | "REMOVED_FROM_SPACE" | "CARD_CLICKED";
  eventTime: string;
  space: { name: string; type: string };
  message?: { name: string; text: string; argumentText?: string };
  user: { name: string; displayName: string };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 20) + "\n\n... (잘림)";
}

function formatProjectList(): string {
  return config.projects
    .map((p) => `• \`${p.alias}\` → ${p.path}`)
    .join("\n");
}

function handleSwitch(userId: string, alias: string): string {
  const project = findProject(alias);
  if (!project) {
    return `❌ \`${alias}\` 프로젝트를 찾을 수 없습니다.\n\n등록된 프로젝트:\n${formatProjectList()}`;
  }
  const state = getOrCreateState(userId, config.defaultProject);
  setActiveProject(userId, project.alias);
  const sessionId = getSessionId(userId, project.alias);
  const sessionInfo = sessionId ? `(세션: ${sessionId.slice(0, 8)}...)` : "(새 세션)";
  return `✅ \`${project.alias}\`로 전환했습니다 ${sessionInfo}\n📁 ${project.path}`;
}

function handleProjects(): string {
  return `📂 등록된 프로젝트:\n${formatProjectList()}`;
}

function handleStatus(userId: string): string {
  const state = getOrCreateState(userId, config.defaultProject);
  const project = findProject(state.activeProject);
  const sessions = Array.from(state.sessions.entries())
    .map(([alias, sid]) => `• \`${alias}\`: ${sid.slice(0, 12)}...`)
    .join("\n");

  return [
    `🔧 현재 프로젝트: \`${state.activeProject}\``,
    project ? `📁 경로: ${project.path}` : "",
    sessions ? `\n💬 활성 세션:\n${sessions}` : "\n💬 활성 세션 없음",
  ]
    .filter(Boolean)
    .join("\n");
}

function handleReset(userId: string): string {
  const state = getOrCreateState(userId, config.defaultProject);
  state.sessions.delete(state.activeProject);
  return `🔄 \`${state.activeProject}\` 세션을 초기화했습니다. 다음 메시지에서 새 세션이 시작됩니다.`;
}

function parseCommand(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { command: trimmed.toLowerCase(), args: "" };
  return {
    command: trimmed.slice(0, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

export async function handleChatWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const event = req.body as ChatEvent;

  if (event.type === "ADDED_TO_SPACE") {
    res.json({
      text: `👋 OpenCode Router가 연결되었습니다!\n\n사용 가능한 명령어:\n• \`/projects\` — 프로젝트 목록\n• \`/switch <별칭>\` — 프로젝트 전환\n• \`/status\` — 현재 상태\n• \`/reset\` — 현재 프로젝트 세션 초기화\n\n그 외 메시지는 현재 선택된 프로젝트의 OpenCode에 전달됩니다.`,
    });
    return;
  }

  if (event.type !== "MESSAGE" || !event.message?.text) {
    res.json({ text: "" });
    return;
  }

  const userId = event.user.name;
  const text = event.message.argumentText ?? event.message.text;
  const spaceName = event.space.name;

  const parsed = parseCommand(text);
  if (parsed) {
    let reply: string;
    switch (parsed.command) {
      case "/switch":
        reply = parsed.args
          ? handleSwitch(userId, parsed.args)
          : `사용법: \`/switch <프로젝트 별칭>\`\n\n${handleProjects()}`;
        break;
      case "/projects":
        reply = handleProjects();
        break;
      case "/status":
        reply = handleStatus(userId);
        break;
      case "/reset":
        reply = handleReset(userId);
        break;
      case "/help":
        reply = `사용 가능한 명령어:\n• \`/projects\` — 프로젝트 목록\n• \`/switch <별칭>\` — 프로젝트 전환\n• \`/status\` — 현재 상태\n• \`/reset\` — 현재 프로젝트 세션 초기화\n• \`/help\` — 이 도움말`;
        break;
      default:
        reply = `알 수 없는 명령어: \`${parsed.command}\`\n\`/help\`로 사용 가능한 명령어를 확인하세요.`;
    }
    res.json({ text: reply });
    return;
  }

  const state = getOrCreateState(userId, config.defaultProject);
  const project = findProject(state.activeProject);
  if (!project) {
    res.json({ text: `❌ 활성 프로젝트 \`${state.activeProject}\`의 설정을 찾을 수 없습니다.` });
    return;
  }

  res.json({ text: `⏳ \`${project.alias}\`에서 처리 중...` });

  processPromptAsync(userId, text, project.path, project.alias, spaceName).catch(
    (err) => console.error("[handler] 비동기 처리 실패:", err),
  );
}

async function processPromptAsync(
  userId: string,
  message: string,
  directory: string,
  projectAlias: string,
  spaceName: string,
): Promise<void> {
  const existingSessionId = getSessionId(userId, projectAlias);

  try {
    const result: PromptResult = await sendPrompt(
      message,
      directory,
      existingSessionId,
    );

    setSessionId(userId, projectAlias, result.sessionId);

    const footer = `\n\n---\n📁 \`${projectAlias}\` | 💰 $${result.cost.toFixed(4)} | 📊 ${result.tokens.input}→${result.tokens.output}`;
    const responseText = truncate(result.text + footer, MAX_CHAT_LENGTH);

    await sendMessage(spaceName, responseText);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[handler] OpenCode 오류:", errorMsg);
    await sendMessage(spaceName, `❌ 오류 발생: ${truncate(errorMsg, 500)}`);
  }
}
