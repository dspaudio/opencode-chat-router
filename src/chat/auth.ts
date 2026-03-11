import { google } from "googleapis";
import { config } from "../config.js";

const oauth2Client = new google.auth.OAuth2(
  config.google.clientId,
  config.google.clientSecret,
);

oauth2Client.setCredentials({
  refresh_token: config.google.refreshToken,
});

const chat = google.chat({ version: "v1", auth: oauth2Client });

export async function sendMessage(
  spaceName: string,
  text: string,
): Promise<string | null> {
  const res = await chat.spaces.messages.create({
    parent: spaceName,
    requestBody: { text },
  });
  return res.data.name ?? null;
}

export async function updateMessage(
  messageName: string,
  text: string,
): Promise<void> {
  await chat.spaces.messages.patch({
    name: messageName,
    updateMask: "text",
    requestBody: { text },
  });
}

export { chat, oauth2Client };
