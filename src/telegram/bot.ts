import { Telegraf } from "telegraf";
import { config, findProject } from "../config.js";
import { sendPrompt, type PromptResult } from "../opencode/client.js";
import {
  getOrCreateState,
  setActiveProject,
  getSessionId,
  setSessionId,
} from "../store/state.js";
import { markdownToTelegramHtml } from "./markdown.js";

const MAX_TELEGRAM_LENGTH = 4096;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 20) + "\n\n... (잘림)";
}

/**
 * MarkdownV2에서 특수문자를 이스케이프한다.
 * 포맷팅 기호가 아닌 데이터(변수) 부분에만 적용해야 한다.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`<>#+\-=|{}.!\\])/g, "\\$1");
}

function escapeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatProjectList(): string {
  return config.projects
    .map((p) => `• \`${escapeMarkdownV2(p.alias)}\` → \`${escapeMarkdownV2(p.path)}\``)
    .join("\n");
}

async function safeReply(
  ctx: { reply: Function },
  text: string,
  parseMode: "MarkdownV2" | "HTML" | undefined = "MarkdownV2",
): Promise<{ message_id: number }> {
  try {
    return await ctx.reply(text, { parse_mode: parseMode });
  } catch {
    const plainText = stripFormatting(text, parseMode);
    return await ctx.reply(plainText);
  }
}

async function safeEditMessageText(
  telegram: { editMessageText: Function },
  chatId: number,
  messageId: number,
  text: string,
  parseMode: "MarkdownV2" | "HTML" | undefined = "MarkdownV2",
): Promise<void> {
  try {
    await telegram.editMessageText(chatId, messageId, undefined, text, {
      parse_mode: parseMode,
    });
  } catch {
    const plainText = stripFormatting(text, parseMode);
    await telegram.editMessageText(chatId, messageId, undefined, plainText);
  }
}

function stripFormatting(text: string, parseMode: "MarkdownV2" | "HTML" | undefined): string {
  if (parseMode === "HTML") {
    return text
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  return text.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, "$1");
}

export function createTelegramBot(): Telegraf {
  const token = config.telegram.botToken;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN이 설정되지 않았습니다.");

  const bot = new Telegraf(token, { handlerTimeout: Infinity });

  const allowedIds = config.telegram.allowedUserIds;

  if (allowedIds.length > 0) {
    bot.use((ctx, next) => {
      const userId = String(ctx.from?.id);
      if (!allowedIds.includes(userId)) {
        console.warn(`[telegram] 차단된 접근: user=${userId} name=${ctx.from?.username}`);
        return;
      }
      return next();
    });
    console.log(`[telegram] 허용된 사용자: ${allowedIds.join(", ")}`);
  } else {
    console.warn("[telegram] ⚠️ TELEGRAM_ALLOWED_USER_IDS 미설정 — 누구나 봇 사용 가능");
  }

  bot.command("myid", (ctx) => {
    ctx.reply(`🆔 당신의 Telegram ID: \`${ctx.from.id}\``, { parse_mode: "MarkdownV2" });
  });

  bot.command("start", (ctx) => {
    ctx.reply(
      "👋 OpenCode Router 연결됨\\!\n\n" +
        "사용 가능한 명령어:\n" +
        "/projects — 프로젝트 목록\n" +
        "/switch \\<별칭\\> — 프로젝트 전환\n" +
        "/status — 현재 상태\n" +
        "/reset — 현재 프로젝트 세션 초기화\n" +
        "/help — 도움말\n\n" +
        "그 외 메시지는 현재 선택된 프로젝트의 OpenCode에 전달됩니다\\.",
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.command("help", (ctx) => {
    ctx.reply(
      "사용 가능한 명령어:\n" +
        "/projects — 프로젝트 목록\n" +
        "/switch \\<별칭\\> — 프로젝트 전환\n" +
        "/status — 현재 상태\n" +
        "/reset — 현재 프로젝트 세션 초기화\n" +
        "/help — 도움말",
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.command("projects", (ctx) => {
    ctx.reply(`📂 등록된 프로젝트:\n${formatProjectList()}`, {
      parse_mode: "MarkdownV2",
    });
  });

  bot.command("switch", (ctx) => {
    const alias = ctx.message.text.split(" ").slice(1).join(" ").trim();
    if (!alias) {
      ctx.reply(`사용법: /switch \\<프로젝트 별칭\\>\n\n📂 등록된 프로젝트:\n${formatProjectList()}`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    const userId = String(ctx.from.id);
    const project = findProject(alias);
    if (!project) {
      ctx.reply(`❌ \`${escapeMarkdownV2(alias)}\` 프로젝트를 찾을 수 없습니다\\.\n\n등록된 프로젝트:\n${formatProjectList()}`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    getOrCreateState(userId, config.defaultProject);
    setActiveProject(userId, project.alias);
    const sessionId = getSessionId(userId, project.alias);
    const sessionInfo = sessionId
      ? `\\(세션: ${escapeMarkdownV2(sessionId.slice(0, 8))}\\.\\.\\.\\.\\)`
      : `\\(새 세션\\)`;
    ctx.reply(`✅ \`${escapeMarkdownV2(project.alias)}\`로 전환했습니다 ${sessionInfo}\n📁 ${escapeMarkdownV2(project.path)}`, {
      parse_mode: "MarkdownV2",
    });
  });

  bot.command("status", (ctx) => {
    const userId = String(ctx.from.id);
    const state = getOrCreateState(userId, config.defaultProject);
    const project = findProject(state.activeProject);
    const sessions = Array.from(state.sessions.entries())
      .map(([alias, sid]) => `• \`${escapeMarkdownV2(alias)}\`: ${escapeMarkdownV2(sid.slice(0, 12))}\\.\\.\\.\\.`)
      .join("\n");

    const lines = [
      `🔧 현재 프로젝트: \`${escapeMarkdownV2(state.activeProject)}\``,
      project ? `📁 경로: ${escapeMarkdownV2(project.path)}` : "",
      sessions ? `\n💬 활성 세션:\n${sessions}` : "\n💬 활성 세션 없음",
    ].filter(Boolean);

    ctx.reply(lines.join("\n"), { parse_mode: "MarkdownV2" });
  });

  bot.command("reset", (ctx) => {
    const userId = String(ctx.from.id);
    const state = getOrCreateState(userId, config.defaultProject);
    state.sessions.delete(state.activeProject);
    ctx.reply(`🔄 \`${escapeMarkdownV2(state.activeProject)}\` 세션을 초기화했습니다\\.`, {
      parse_mode: "MarkdownV2",
    });
  });

  bot.on("text", (ctx) => {
    const userId = String(ctx.from.id);
    const text = ctx.message.text;

    const state = getOrCreateState(userId, config.defaultProject);
    const project = findProject(state.activeProject);
    if (!project) {
      ctx.reply(`❌ 활성 프로젝트 \`${escapeMarkdownV2(state.activeProject)}\`의 설정을 찾을 수 없습니다\\.`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    processPrompt(ctx, userId, text, project.alias, project.path);
  });

  return bot;
}

async function processPrompt(
  ctx: { chat: { id: number }; reply: Function; telegram: { editMessageText: Function } },
  userId: string,
  message: string,
  projectAlias: string,
  directory: string,
): Promise<void> {
  let pendingMessageId: number | undefined;

  try {
    const pending = await ctx.reply(`⏳ <code>${escapeHtmlEntities(projectAlias)}</code>에서 처리 중...`, {
      parse_mode: "HTML",
    });
    pendingMessageId = pending.message_id;

    const existingSessionId = getSessionId(userId, projectAlias);
    const result: PromptResult = await sendPrompt(
      message,
      directory,
      existingSessionId,
    );

    setSessionId(userId, projectAlias, result.sessionId);

    const htmlResponse = markdownToTelegramHtml(result.text);
    const footer = `\n\n———\n📁 ${escapeHtmlEntities(projectAlias)} | 💰 $${escapeHtmlEntities(result.cost.toFixed(4))} | 📊 ${result.tokens.input}→${result.tokens.output}`;
    const responseText = truncate(htmlResponse + footer, MAX_TELEGRAM_LENGTH);

    if (pendingMessageId) {
      await safeEditMessageText(
        ctx.telegram,
        ctx.chat.id,
        pendingMessageId,
        responseText,
        "HTML",
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[telegram] OpenCode 오류:", errorMsg);
    if (pendingMessageId) {
      await safeEditMessageText(
        ctx.telegram,
        ctx.chat.id,
        pendingMessageId,
        `❌ 오류 발생: ${escapeHtmlEntities(truncate(errorMsg, 500))}`,
        "HTML",
      ).catch(() => {});
    }
  }
}
