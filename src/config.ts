import "dotenv/config";

export interface ProjectConfig {
  alias: string;
  path: string;
}

function parseProjects(raw: string): ProjectConfig[] {
  return raw.split(",").map((entry) => {
    const [alias, ...rest] = entry.trim().split(":");
    const path = rest.join(":");
    if (!alias || !path) {
      throw new Error(
        `잘못된 PROJECTS 형식: "${entry}". "별칭:경로" 형식이어야 합니다.`,
      );
    }
    return { alias: alias.trim(), path: path.trim() };
  });
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  google: {
    clientId: process.env["GOOGLE_CLIENT_ID"] || undefined,
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"] || undefined,
    refreshToken: process.env["GOOGLE_REFRESH_TOKEN"] || undefined,
    accountEmail: optionalEnv(
      "GOOGLE_ACCOUNT_EMAIL",
      "user@example.com",
    ),
  },

  telegram: {
    botToken: process.env["TELEGRAM_BOT_TOKEN"] || undefined,
    allowedUserIds: process.env["TELEGRAM_ALLOWED_USER_IDS"]
      ? process.env["TELEGRAM_ALLOWED_USER_IDS"].split(",").map((id) => id.trim()).filter(Boolean)
      : [],
  },

  opencode: {
    port: parseInt(optionalEnv("OPENCODE_SERVER_PORT", "4096"), 10),
    password: process.env["OPENCODE_SERVER_PASSWORD"] || undefined,
  },

  projects: parseProjects(requireEnv("PROJECTS")),
  defaultProject: requireEnv("DEFAULT_PROJECT"),

  port: parseInt(optionalEnv("PORT", "8080"), 10),
  chatVerificationToken: process.env["CHAT_VERIFICATION_TOKEN"] || undefined,

  get googleEnabled(): boolean {
    return !!(this.google.clientId && this.google.clientSecret && this.google.refreshToken);
  },

  get telegramEnabled(): boolean {
    return !!this.telegram.botToken;
  },
} as const;

export function findProject(alias: string): ProjectConfig | undefined {
  return config.projects.find(
    (p) => p.alias.toLowerCase() === alias.toLowerCase(),
  );
}
