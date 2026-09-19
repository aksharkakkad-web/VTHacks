import type { Contact } from "../../lib/trip-state/model";

/** Positive private-chat IDs only: never interpret a phone, username or group as a contact. */
export function telegramChatId(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Invalid Telegram private chat ID");
  return value;
}

export function telegramSender(options: { simulated: boolean; botToken?: string; allowedChatIds?: string; fetch?: typeof fetch }) {
  return async (contact: Contact, message: string, key: string) => {
    if (!contact.consent) throw new Error("Notification consent required");
    const chatId = telegramChatId(contact.telegramChatId);
    if (options.simulated) return { id: `demo-${key}`, simulated: true };
    if (!options.botToken || !/^\d{6,16}:[A-Za-z0-9_-]{20,150}$/.test(options.botToken) || !options.allowedChatIds) throw new Error("Telegram is not configured");
    const allowed = options.allowedChatIds.split(",").map(value => telegramChatId(value.trim()));
    if (!allowed.includes(chatId)) throw new Error("Telegram contact is not connected");
    if (!message.trim() || message.length > 4096) throw new Error("Invalid Telegram message length");
    try {
      const response = await (options.fetch ?? fetch)(`https://api.telegram.org/bot${options.botToken}/sendMessage`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(6000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, protect_content: true, link_preview_options: { is_disabled: true }, allow_paid_broadcast: false }),
      });
      const result = await response.json() as { ok?: unknown; result?: { message_id?: unknown; chat?: { id?: unknown; type?: unknown } } };
      if (!response.ok || result.ok !== true || !Number.isSafeInteger(result.result?.message_id) || Number(result.result?.message_id) <= 0 || result.result?.chat?.type !== "private" || String(result.result.chat.id) !== chatId) throw new Error("Acceptance not confirmed");
      return { id: String(result.result.message_id), simulated: false };
    } catch {
      // Fetch exceptions can include the token-bearing API URL. Never propagate it.
      // No automatic retry: a lost response may still mean the message was sent.
      throw new Error("Telegram acceptance could not be confirmed");
    }
  };
}
