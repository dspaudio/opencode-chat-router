import express from "express";
import { config } from "./config.js";
import { handleChatWebhook } from "./chat/handler.js";
import { createTelegramBot } from "./telegram/bot.js";
import { shutdown } from "./opencode/client.js";

const app = express();
app.use(express.json());

app.post("/chat", handleChatWebhook);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    projects: config.projects.map((p) => p.alias),
    channels: {
      google: config.googleEnabled,
      telegram: config.telegramEnabled,
    },
  });
});

const server = app.listen(config.port, () => {
  console.log(`[router] 서버 시작: http://localhost:${config.port}`);
  console.log(
    `[router] 등록된 프로젝트 (${config.projects.length}개): ${config.projects.map((p) => p.alias).join(", ")}`,
  );

  if (config.googleEnabled) {
    console.log(`[router] Google Chat webhook: POST http://localhost:${config.port}/chat`);
  }
});

let telegramBot: ReturnType<typeof createTelegramBot> | null = null;

if (config.telegramEnabled) {
  telegramBot = createTelegramBot();
  telegramBot.launch().then(() => {
    console.log("[router] Telegram 봇 시작됨 (long polling)");
  });
}

if (!config.googleEnabled && !config.telegramEnabled) {
  console.warn("[router] ⚠️ Google Chat과 Telegram 모두 비활성 상태입니다. .env를 확인하세요.");
}

function gracefulShutdown(signal: string): void {
  console.log(`\n[router] ${signal} 수신, 종료 중...`);
  telegramBot?.stop(signal);
  shutdown();
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
