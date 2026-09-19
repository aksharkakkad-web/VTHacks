#!/usr/bin/env node
// Read-only Telegram verification. Never sends messages or acknowledges/deletes updates.
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

class SetupError extends Error {}
const path = fileURLToPath(new URL("../../.env.telegram.local", import.meta.url));
try {
  let content = readFileSync(path, "utf8");
  const env = parseEnv(content);
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token || !/^\d{6,16}:[A-Za-z0-9_-]{20,150}$/.test(token)) throw new SetupError("Save a valid TELEGRAM_BOT_TOKEN in .env.telegram.local first.");
  const call = async (method, body = {}) => {
    let response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    } catch { throw new SetupError("Telegram verification could not connect. No message was sent."); }
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new SetupError(`Telegram ${method} verification failed (HTTP ${response.status}).`);
    return result.result;
  };
  const bot = await call("getMe");
  if (!bot.is_bot || typeof bot.username !== "string") throw new SetupError("The token must belong to a bot.");
  if ((await call("getWebhookInfo")).url) throw new SetupError("This bot already has a webhook. Coordinate with its owner before changing its setup.");
  const updates = await call("getUpdates", { limit: 100, timeout: 0 });
  const chats = new Set();
  for (const update of updates) {
    const message = update.message;
    if (message?.chat?.type === "private" && message.from?.is_bot === false && message.chat.id === message.from.id && /^\/start(?:\s|$)/.test(message.text ?? "")) chats.add(String(message.chat.id));
  }
  console.log(JSON.stringify({ botVerified: true, botUsername: bot.username, startedPrivateChats: chats.size }));
  if (chats.size !== 1) throw new SetupError("Need exactly one intended private recipient to press Start. Multiple chats require explicitly choosing the recipient; none will be guessed.");
  const id = [...chats][0];
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new SetupError("Invalid private chat ID.");
  if (env.TELEGRAM_ALLOWED_CHAT_IDS && env.TELEGRAM_ALLOWED_CHAT_IDS !== id) throw new SetupError("Existing allowed contacts differ. Review them explicitly before replacing the configuration.");
  for (const [key, value] of Object.entries({ TELEGRAM_BOT_USERNAME: bot.username, TELEGRAM_ALLOWED_CHAT_IDS: id })) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    content = pattern.test(content) ? content.replace(pattern, `${key}=${value}`) : `${content.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
  console.log("Private recipient saved locally. No message sent. Copy these server settings into the deployment; never commit them.");
} catch (error) {
  // Only our controlled messages are printed, never the upstream payload or token URL.
  console.error(error instanceof SetupError ? error.message : "Telegram setup failed; no secret values were printed.");
  process.exitCode = 1;
}
